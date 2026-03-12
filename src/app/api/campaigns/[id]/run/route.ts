import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProvider, personalizeMessage, formatPhone } from '@/lib/wa-provider';

// POST /api/campaigns/[id]/run — Execute broadcast for a campaign
// Processes ALL pending messages with delays between each message
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Get campaign with device
        const { data: campaign } = await supabase
            .from('campaigns')
            .select('*, device:devices(*)')
            .eq('id', id)
            .single();

        if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

        const device = campaign.device;
        if (!device || device.status !== 'connected') {
            return NextResponse.json({ error: 'Device not connected' }, { status: 400 });
        }

        const provider = getProvider(device.provider, device.provider_config as Record<string, string>);
        let totalSent = 0;
        let totalFailed = 0;

        // Process ALL pending messages in batches
        let hasMore = true;
        while (hasMore) {
            const { data: pendingMessages } = await supabase
                .from('broadcast_messages')
                .select('*, contact:contacts(name, phone, metadata)')
                .eq('campaign_id', id)
                .eq('status', 'pending')
                .limit(10);

            if (!pendingMessages || pendingMessages.length === 0) {
                hasMore = false;
                break;
            }

            for (let i = 0; i < pendingMessages.length; i++) {
                const msg = pendingMessages[i];
                const contact = msg.contact;

                // Pick random greeting for each message
                const greetingList: string[] = campaign.greetings || [];
                const randomGreeting = greetingList.length > 0
                    ? greetingList[Math.floor(Math.random() * greetingList.length)]
                    : '';

                const personalized = personalizeMessage(campaign.message_template, {
                    name: contact?.name || '',
                    phone: msg.phone,
                    greeting: randomGreeting,
                    ...((contact?.metadata as object) || {}),
                });

                const to = formatPhone(msg.phone);

                let result;
                if (campaign.media_type === 'image' && campaign.media_url) {
                    result = await provider.sendImage(device.session_id, to, campaign.media_url, personalized);
                } else if (campaign.media_type === 'video' && campaign.media_url) {
                    result = await provider.sendVideo(device.session_id, to, campaign.media_url, personalized);
                } else if (campaign.media_type === 'document' && campaign.media_url) {
                    result = await provider.sendDocument(device.session_id, to, campaign.media_url, 'document');
                } else {
                    result = await provider.sendText(device.session_id, to, personalized);
                }

                if (result.success) {
                    await supabase.from('broadcast_messages').update({
                        status: 'sent',
                        sent_at: new Date().toISOString(),
                    }).eq('id', msg.id);
                    totalSent++;

                    // Save to messages table for inbox history
                    await supabase.from('messages').insert({
                        tenant_id: device.tenant_id,
                        device_id: device.id,
                        phone: msg.phone,
                        direction: 'outbound',
                        message_type: campaign.media_type === 'text' || !campaign.media_type ? 'text' : campaign.media_type,
                        content: personalized,
                        is_from_bot: false,
                    }).then(({ error }) => {
                        if (error) console.warn('[Campaign Run] Message history insert error:', error.message);
                    });
                } else {
                    await supabase.from('broadcast_messages').update({
                        status: 'failed',
                        error_message: result.error,
                    }).eq('id', msg.id);
                    totalFailed++;
                }

                // Update campaign counters in real-time (every message)
                try {
                    await supabase.rpc('increment_campaign_counts', {
                        p_campaign_id: id,
                        p_sent: result.success ? 1 : 0,
                        p_failed: result.success ? 0 : 1,
                    });
                } catch {
                    // Fallback: direct update
                    const { data: current } = await supabase
                        .from('campaigns')
                        .select('sent_count, failed_count')
                        .eq('id', id)
                        .single();
                    if (current) {
                        await supabase.from('campaigns').update({
                            sent_count: (current.sent_count || 0) + (result.success ? 1 : 0),
                            failed_count: (current.failed_count || 0) + (result.success ? 0 : 1),
                        }).eq('id', id);
                    }
                }

                // Random delay between messages (skip after last message)
                if (i < pendingMessages.length - 1 || hasMore) {
                    const delay = Math.floor(
                        Math.random() * (campaign.max_delay - campaign.min_delay + 1) + campaign.min_delay
                    ) * 1000;
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }

        // Mark campaign as completed
        await supabase.from('campaigns').update({
            status: 'completed',
            completed_at: new Date().toISOString(),
        }).eq('id', id);

        return NextResponse.json({
            success: true,
            data: { sent: totalSent, failed: totalFailed, completed: true },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
