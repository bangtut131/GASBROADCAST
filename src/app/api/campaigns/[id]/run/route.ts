import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProvider, personalizeMessage, formatPhone } from '@/lib/wa-provider';

// POST /api/campaigns/[id]/run — Execute broadcast for a campaign
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

        // Process ALL pending messages in background
        processMessagesInBackground({
            id,
            device,
            campaign,
            supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY! // need service key for background
        }).catch(err => console.error('Background broadcast failed:', err));

        return NextResponse.json({
            success: true,
            message: 'Broadcast started in background',
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function processMessagesInBackground(ctx: { id: string, device: any, campaign: any, supabaseKey: string }) {
    const { id, device, campaign, supabaseKey } = ctx;
    const { createClient: createBgClient } = await import('@supabase/supabase-js');
    const bgSupabase = createBgClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabaseKey);
    
    // Lazy format provider logic
    const { getProvider: getBgProvider, personalizeMessage: pMsg, formatPhone: fPhone } = await import('@/lib/wa-provider');
    const provider = getBgProvider(device.provider, device.provider_config as Record<string, string>);
    
    let hasMore = true;
    while (hasMore) {
        const { data: pendingMessages } = await bgSupabase
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

            // Pick random greeting
            const greetingList: string[] = campaign.greetings || [];
            const randomGreeting = greetingList.length > 0
                ? greetingList[Math.floor(Math.random() * greetingList.length)]
                : '';

            // Generate Short Link
            const nanoid = Math.random().toString(36).substring(2, 8); // simple 6 char random string
            const longUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/unsubscribe/${device.tenant_id}/${Buffer.from(msg.phone).toString('base64')}`;
            
            await bgSupabase.from('short_links').insert({
                id: nanoid,
                target_url: longUrl
            });

            const unsubscribe_link = `${process.env.NEXT_PUBLIC_APP_URL}/u/${nanoid}`;

            const personalized = pMsg(campaign.message_template, {
                name: contact?.name || '',
                phone: msg.phone,
                greeting: randomGreeting,
                unsubscribe_link,
                ...((contact?.metadata as object) || {}),
            });

            const to = fPhone(msg.phone);

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
                await bgSupabase.from('broadcast_messages').update({
                    status: 'sent',
                    sent_at: new Date().toISOString(),
                }).eq('id', msg.id);

                // Save to messages table for inbox history
                await bgSupabase.from('messages').insert({
                    tenant_id: device.tenant_id,
                    device_id: device.id,
                    phone: msg.phone,
                    direction: 'outbound',
                    message_type: campaign.media_type === 'text' || !campaign.media_type ? 'text' : campaign.media_type,
                    content: personalized,
                    is_from_bot: false,
                });
            } else {
                await bgSupabase.from('broadcast_messages').update({
                    status: 'failed',
                    error_message: result.error,
                }).eq('id', msg.id);
            }

            // Fallback: direct update counters in real-time
            const { data: current } = await bgSupabase
                .from('campaigns')
                .select('sent_count, failed_count')
                .eq('id', id)
                .single();
            if (current) {
                await bgSupabase.from('campaigns').update({
                    sent_count: (current.sent_count || 0) + (result.success ? 1 : 0),
                    failed_count: (current.failed_count || 0) + (result.success ? 0 : 1),
                }).eq('id', id);
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
    await bgSupabase.from('campaigns').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
    }).eq('id', id);
}
