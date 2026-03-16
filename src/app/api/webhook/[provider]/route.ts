import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { WAHAProvider } from '@/lib/wa-provider/waha';
import { OfficialProvider } from '@/lib/wa-provider/official';
import { createAIProvider, AIMessage } from '@/lib/ai-provider';
import { formatPhone } from '@/lib/wa-provider';

// POST /api/webhook/[provider] — Universal webhook receiver
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ provider: string }> }
) {
    try {
        const { provider } = await params;
        const supabase = await createServiceClient();
        const payload = await request.json();

        // Parse event from the correct provider
        let parsedEvent: { type: string; sessionId: string; data: Record<string, unknown> } | null = null;

        if (provider === 'waha') {
            const wahaProvider = new WAHAProvider();
            parsedEvent = wahaProvider.handleWebhook(payload);
        } else if (provider === 'official') {
            const officialProvider = new OfficialProvider();
            parsedEvent = officialProvider.handleWebhook(payload);
        } else {
            return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
        }

        if (!parsedEvent) {
            return NextResponse.json({ received: true, processed: false });
        }

        // Handle connection status events
        if (parsedEvent.type === 'connection') {
            const status = (parsedEvent.data.status as string) || '';
            const dbStatus = status === 'WORKING' ? 'connected'
                : status === 'SCAN_QR_CODE' ? 'qr_pending' : 'disconnected';

            await supabase.from('devices')
                .update({ status: dbStatus })
                .eq('session_id', parsedEvent.sessionId);

            return NextResponse.json({ received: true });
        }

        // Handle incoming messages
        if (parsedEvent.type === 'message') {
            const { from: rawFrom, author, body: messageBody, messageId, messageType: rawMessageType } = parsedEvent.data as {
                from: string; author?: string; body: string; messageId: string; messageType?: string; timestamp?: number;
            };

            if (!rawFrom) return NextResponse.json({ received: true });

            const isStatus = rawFrom === 'status@broadcast';
            const actualFrom = isStatus ? (author || rawFrom) : rawFrom;
            const messageType = isStatus ? 'status' : (rawMessageType || 'text');
            const phone = formatPhone(actualFrom);

            // Find the device
            const { data: device } = await supabase
                .from('devices')
                .select('*')
                .eq('session_id', parsedEvent.sessionId)
                .single();

            if (!device) return NextResponse.json({ received: true, error: 'Device not found' });

            // Get or create contact safely without wiping existing name
            let contactId = null;
            const { data: existingContact } = await supabase
                .from('contacts')
                .select('id')
                .eq('tenant_id', device.tenant_id)
                .eq('phone', phone)
                .maybeSingle();

            if (existingContact) {
                contactId = existingContact.id;
            } else {
                const { data: newContact } = await supabase
                    .from('contacts')
                    .insert({ tenant_id: device.tenant_id, phone })
                    .select('id')
                    .maybeSingle();
                if (newContact) contactId = newContact.id;
            }

            // Save inbound message
            await supabase.from('messages').insert({
                tenant_id: device.tenant_id,
                device_id: device.id,
                contact_id: contactId,
                phone,
                direction: 'inbound',
                message_type: messageType,
                content: messageBody,
                wa_message_id: messageId,
            });

            // --- Generate Incoming Message Notification ---
            try {
                await supabase.from('notifications').insert({
                    tenant_id: device.tenant_id,
                    device_id: device.id,
                    title: `Pesan Baru dari ${phone}`,
                    message: messageBody ? (messageBody.substring(0, 60) + (messageBody.length > 60 ? '...' : '')) : '[Media]',
                    type: 'incoming_message'
                });
            } catch (notifErr: any) {
                console.error('[Webhook provider] Failed to generate notification:', notifErr.message);
            }

            const message = (messageBody || '').toLowerCase().trim();

            // Ignore status messages for auto-reply and unsub checks
            if (isStatus) {
                return NextResponse.json({ received: true, statusMessageProcessed: true });
            }

            // 1. Intercept Unsubscribe Request
            if (message === 'unsub' || message === 'unsubscribe') {
                await supabase.from('blacklisted_contacts').upsert(
                    { tenant_id: device.tenant_id, phone, reason: 'unsubscribed via auto-reply keyword' },
                    { onConflict: 'tenant_id,phone' }
                );

                const replyText = 'Pesan diterima. Nomor Anda telah berhasil dihapus dari daftar. Anda tidak akan menerima rentetan pesan promosi dari kami lagi.';

                if (provider === 'waha') {
                    const wahaProvider = new WAHAProvider(device.provider_config as { apiUrl?: string; apiKey?: string });
                    await wahaProvider.sendText(device.session_id, phone, replyText);
                } else {
                    const officialProvider = new OfficialProvider(device.provider_config as { accessToken?: string; phoneNumberId?: string });
                    await officialProvider.sendText(device.session_id, phone, replyText);
                }

                return NextResponse.json({ received: true, unsubscribed: true });
            }

            // 2. Check auto-reply rules (ordered by priority desc)
            const { data: rules } = await supabase
                .from('autoreply_rules')
                .select('*')
                .eq('tenant_id', device.tenant_id)
                .eq('is_active', true)
                .or(`device_id.eq.${device.id},device_id.is.null`)
                .order('priority', { ascending: false });

            if (!rules || rules.length === 0) {
                return NextResponse.json({ received: true });
            }

            let matchedRule: typeof rules[0] | null = null;

            for (const rule of rules) {
                if (rule.trigger_type === 'ai') {
                    matchedRule = rule; // AI rules match all messages
                    break;
                }

                const trigger = (rule.trigger_value || '').toLowerCase();
                if (!trigger && rule.trigger_type !== 'ai') continue;

                if (rule.trigger_type === 'keyword') {
                    // Multiple keywords separated by comma
                    const keywords = trigger.split(',').map((k: string) => k.trim()).filter(Boolean);
                    if (keywords.some((kw: string) => message === kw)) { matchedRule = rule; break; }
                } else if (rule.trigger_type === 'contains') {
                    if (message.includes(trigger)) { matchedRule = rule; break; }
                } else if (rule.trigger_type === 'regex') {
                    try {
                        if (new RegExp(trigger, 'i').test(message)) { matchedRule = rule; break; }
                    } catch { }
                }
            }

            if (!matchedRule) return NextResponse.json({ received: true });

            let replyText = '';

            if (matchedRule.trigger_type === 'ai') {
                // === AI Reply ===
                try {
                    const aiProvider = createAIProvider({
                        ai_base_url: matchedRule.ai_base_url,
                        ai_api_key: matchedRule.ai_api_key,
                        ai_model: matchedRule.ai_model,
                        ai_system_prompt: matchedRule.ai_system_prompt,
                        ai_temperature: matchedRule.ai_temperature,
                        ai_max_tokens: matchedRule.ai_max_tokens,
                    });

                    const contextTurns = matchedRule.ai_context_turns || 5;

                    // Load conversation history
                    const { data: convRecord } = await supabase
                        .from('ai_conversations')
                        .select('messages')
                        .eq('tenant_id', device.tenant_id)
                        .eq('phone', phone)
                        .eq('device_id', device.id)
                        .single();

                    const history: AIMessage[] = (convRecord?.messages || []).slice(-(contextTurns * 2));

                    // Get AI reply
                    const aiResponse = await aiProvider.conversate(history, messageBody);
                    replyText = aiResponse.content;

                    // Update conversation history
                    const newHistory: AIMessage[] = [
                        ...history,
                        { role: 'user', content: messageBody },
                        { role: 'assistant', content: replyText },
                    ];

                    await supabase
                        .from('ai_conversations')
                        .upsert(
                            {
                                tenant_id: device.tenant_id,
                                phone,
                                device_id: device.id,
                                rule_id: matchedRule.id,
                                messages: newHistory.slice(-contextTurns * 2),
                                last_message_at: new Date().toISOString(),
                            },
                            { onConflict: 'tenant_id,phone,device_id' }
                        );
                } catch (aiErr: any) {
                    console.error('AI reply error:', aiErr);
                    return NextResponse.json({ received: true, error: 'AI reply failed: ' + aiErr.message });
                }
            } else {
                replyText = matchedRule.response_text;
            }

            if (!replyText) return NextResponse.json({ received: true });

            // Send reply via the same device
            let sendResult;
            if (provider === 'waha') {
                const wahaProvider = new WAHAProvider(device.provider_config as { apiUrl?: string; apiKey?: string });
                sendResult = await wahaProvider.sendText(device.session_id, phone, replyText);
            } else {
                const officialProvider = new OfficialProvider(device.provider_config as { accessToken?: string; phoneNumberId?: string });
                sendResult = await officialProvider.sendText(device.session_id, phone, replyText);
            }

            if (sendResult.success) {
                // Log outbound reply
                await supabase.from('messages').insert({
                    tenant_id: device.tenant_id,
                    device_id: device.id,
                    contact_id: contactId,
                    phone,
                    direction: 'outbound',
                    message_type: 'text',
                    content: replyText,
                    is_from_bot: true,
                    wa_message_id: sendResult.messageId,
                });
            }

            return NextResponse.json({ received: true, replied: sendResult?.success || false });
        }

        return NextResponse.json({ received: true });
    } catch (error: any) {
        console.error('Webhook error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// GET — Webhook verification (for Meta Cloud API)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ provider: string }> }
) {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
        return new NextResponse(challenge || '', { status: 200 });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
