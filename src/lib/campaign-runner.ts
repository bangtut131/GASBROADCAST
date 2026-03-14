import { createClient } from '@supabase/supabase-js';
import { getProvider, personalizeMessage, formatPhone } from '@/lib/wa-provider';

/**
 * Step 1: Generates the target list and creates pending 'broadcast_messages' records.
 * Can be called immediately on creation or lazily by the cron runner.
 */
export async function startBroadcast(supabase: any, campaign: any, tenantId: string) {
    try {
        let targets: { phone: string; contact_id?: string }[] = [];

        if (campaign.target_type === 'group' && campaign.target_group_id) {
            const { data: members } = await supabase
                .from('contact_group_members')
                .select('contact:contacts(id, phone)')
                .eq('group_id', campaign.target_group_id);
            targets = (members || [])
                .map((m: any) => ({ phone: m.contact?.phone, contact_id: m.contact?.id }))
                .filter((t: any) => t.phone);
        } else if (campaign.target_type === 'manual' && campaign.target_phones) {
            // Find existing contacts to link contact_id for {name} parsing
            const { data: existingContacts } = await supabase
                .from('contacts')
                .select('id, phone')
                .eq('tenant_id', tenantId)
                .in('phone', campaign.target_phones);
            
            targets = campaign.target_phones.map((p: string) => {
                const match = existingContacts?.find((c: any) => c.phone === p);
                return { phone: p, contact_id: match?.id };
            });
        }

        if (targets.length === 0) return;

        // Deduplicate Targets (Remove duplicates)
        const uniqueTargetsMap = new Map();
        for (const t of targets) {
            if (t.phone && !uniqueTargetsMap.has(t.phone)) {
                uniqueTargetsMap.set(t.phone, t);
            }
        }
        targets = Array.from(uniqueTargetsMap.values());

        // Skip blacklisted phones
        const phonesToCheck = targets.map((t: any) => t.phone);
        const { data: blacklisted } = await supabase
            .from('blacklisted_contacts')
            .select('phone')
            .eq('tenant_id', tenantId)
            .in('phone', phonesToCheck);
            
        const blacklistedPhones = new Set((blacklisted || []).map((b: any) => b.phone));

        // Create broadcast_messages records (pending / failed for blacklisted)
        let messages = [];
        for (const t of targets) {
            const isBlacklisted = blacklistedPhones.has(t.phone);
            messages.push({
                campaign_id: campaign.id,
                contact_id: t.contact_id || null,
                phone: t.phone,
                status: isBlacklisted ? 'failed' : 'pending',
                error_message: isBlacklisted ? 'BLACKLISTED' : null
            });
        }

        if (messages.length === 0) return;

        await supabase.from('broadcast_messages').insert(messages);

        // Calculate actual failed vs total
        const initialFailed = messages.filter(m => m.status === 'failed').length;

        // Update total_recipients in campaigns
        await supabase
            .from('campaigns')
            .update({ 
                total_recipients: targets.length, 
                failed_count: initialFailed,
                status: initialFailed === targets.length ? 'completed' : 'running'
            })
            .eq('id', campaign.id);
    } catch (err) {
        console.error('[CampaignRunner] startBroadcast error:', err);
    }
}

/**
 * Step 2: Iterates over pending messages and sends them via Baileys Bridge
 */
export async function processMessagesInBackground(ctx: { id: string, device: any, campaign: any, supabaseKey: string }) {
    const { id, device, campaign, supabaseKey } = ctx;
    const bgSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabaseKey);
    const provider = getProvider(device.provider, device.provider_config as Record<string, string>);
    
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

            // Generate Short Link for Unsubscribe
            const nanoid = Math.random().toString(36).substring(2, 8); 
            const longUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/unsubscribe/${device.tenant_id}/${Buffer.from(msg.phone).toString('base64')}`;
            
            await bgSupabase.from('short_links').insert({
                id: nanoid,
                target_url: longUrl
            });

            const unsubscribe_link = `${process.env.NEXT_PUBLIC_APP_URL}/u/${nanoid}`;

            const personalized = personalizeMessage(campaign.message_template, {
                name: contact?.name || '',
                phone: msg.phone,
                greeting: randomGreeting,
                unsubscribe_link,
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

    // Generate System Notification
    try {
        await bgSupabase.from('notifications').insert({
            tenant_id: device.tenant_id,
            device_id: device.id,
            campaign_id: id,
            title: `Broadcast Selesai: ${campaign.name}`,
            message: `Pengiriman broadcast ke ${campaign.total_recipients || 0} kontak telah selesai.`,
            type: 'campaign_completed'
        });
    } catch (notifErr) {
        console.error('[CampaignRunner] Failed to generate notification:', notifErr);
    }
}
