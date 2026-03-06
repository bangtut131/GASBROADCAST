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

        // Get pending messages
        const { data: pendingMessages } = await supabase
            .from('broadcast_messages')
            .select('*, contact:contacts(name, phone, metadata)')
            .eq('campaign_id', id)
            .eq('status', 'pending')
            .limit(10); // Process 10 at a time

        if (!pendingMessages || pendingMessages.length === 0) {
            // Mark campaign as completed
            await supabase.from('campaigns').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
            return NextResponse.json({ success: true, data: { completed: true } });
        }

        const provider = getProvider(device.provider, device.provider_config as Record<string, string>);
        let sentCount = 0;
        let failedCount = 0;

        for (const msg of pendingMessages) {
            const contact = msg.contact;
            const personalized = personalizeMessage(campaign.message_template, {
                name: contact?.name || '',
                phone: msg.phone,
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
                sentCount++;
            } else {
                await supabase.from('broadcast_messages').update({
                    status: 'failed',
                    error_message: result.error,
                }).eq('id', msg.id);
                failedCount++;
            }

            // Random delay between messages
            if (pendingMessages.indexOf(msg) < pendingMessages.length - 1) {
                const delay = Math.floor(
                    Math.random() * (campaign.max_delay - campaign.min_delay + 1) + campaign.min_delay
                ) * 1000;
                await new Promise(r => setTimeout(r, delay));
            }
        }

        // Update campaign counters (fallback if RPC not available)
        try {
            await supabase.rpc('increment_campaign_counts', {
                p_campaign_id: id,
                p_sent: sentCount,
                p_failed: failedCount,
            });
        } catch {
            // Fallback: read current counts then update
            const { data: current } = await supabase
                .from('campaigns')
                .select('sent_count, failed_count')
                .eq('id', id)
                .single();
            if (current) {
                await supabase.from('campaigns').update({
                    sent_count: (current.sent_count || 0) + sentCount,
                    failed_count: (current.failed_count || 0) + failedCount,
                }).eq('id', id);
            }
        }

        return NextResponse.json({
            success: true,
            data: { sent: sentCount, failed: failedCount, remaining: pendingMessages.length - sentCount - failedCount },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
