import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { WAHAProvider } from '@/lib/wa-provider/waha';
import { createAIProvider, AIMessage } from '@/lib/ai-provider';
import { formatPhone } from '@/lib/wa-provider';

/**
 * Webhook handler for GAS Smart Broadcast Baileys Bridge (wa-web provider)
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        console.log('[Webhook wa-web] Received:', JSON.stringify(body).substring(0, 300));

        // Validate API secret from bridge
        const apiKey = request.headers.get('x-api-key');
        const expectedSecret = process.env.BRIDGE_API_SECRET || process.env.CRON_SECRET;
        if (expectedSecret && apiKey !== expectedSecret) {
            console.warn('[Webhook wa-web] Unauthorized — key mismatch');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { sessionId, event, data } = body;
        if (!sessionId || !event) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        console.log(`[Webhook wa-web] event=${event} sessionId=${sessionId}`);

        const supabase = await createServiceClient();

        /**
         * Find the device using multiple strategies:
         * 1. Exact session_id match
         * 2. Match by phone_number
         * 3. Match by tenant_id prefix (sessionId starts with tenant_id prefix)
         *    e.g. sessionId="d83c0e4a-1773294344822" → tenant_id starts with "d83c0e4a"
         */
        async function findDevice(sid: string, phoneNumber?: string) {
            // Strategy 1: exact session_id match
            const { data: bySession } = await supabase
                .from('devices')
                .select('id, tenant_id, session_id, phone_number, provider, name, provider_config')
                .eq('session_id', sid)
                .maybeSingle();
            if (bySession) {
                console.log(`[Webhook wa-web] ✅ Device found by session_id`);
                return bySession;
            }

            // Strategy 2: match by phone_number
            if (phoneNumber) {
                const cleaned = phoneNumber.replace(/\D/g, '');
                const { data: byPhone } = await supabase
                    .from('devices')
                    .select('id, tenant_id, session_id, phone_number, provider, name, provider_config')
                    .eq('phone_number', cleaned)
                    .maybeSingle();
                if (byPhone) {
                    console.log(`[Webhook wa-web] ✅ Device found by phone_number=${cleaned}, updating session_id`);
                    await supabase.from('devices').update({ session_id: sid }).eq('id', byPhone.id);
                    return byPhone;
                }
            }

            // Strategy 3: derive tenant_id from sessionId prefix
            // sessionId format: "{tenant_id.substring(0,8)}-{timestamp}"
            // e.g. "d83c0e4a-1773294344822" → tenant_id starts with "d83c0e4a"
            const tenantPrefix = sid.split('-')[0];
            if (tenantPrefix && tenantPrefix.length === 8) {
                console.log(`[Webhook wa-web] Trying tenant prefix lookup: tenant_id LIKE '${tenantPrefix}%'`);
                const { data: byTenant } = await supabase
                    .from('devices')
                    .select('id, tenant_id, session_id, phone_number, provider, name, provider_config')
                    .ilike('tenant_id', `${tenantPrefix}%`)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (byTenant && byTenant.length > 0) {
                    const device = byTenant[0];
                    console.log(`[Webhook wa-web] ✅ Device found by tenant prefix, id=${device.id} provider=${device.provider}, updating session_id`);
                    await supabase.from('devices').update({ session_id: sid }).eq('id', device.id);
                    return device;
                }
            }

            console.error(`[Webhook wa-web] ❌ No device found. sessionId=${sid} tenantPrefix=${tenantPrefix}`);
            return null;
        }

        // ── session.connected ──────────────────────────────────────
        if (event === 'session.connected') {
            const phoneNumber = data?.phoneNumber;
            const device = await findDevice(sessionId, phoneNumber);
            if (device) {
                const cleaned = phoneNumber?.replace(/\D/g, '') || null;
                await supabase
                    .from('devices')
                    .update({ status: 'connected', phone_number: cleaned, session_id: sessionId })
                    .eq('id', device.id);
                console.log(`[Webhook wa-web] ✅ session.connected — device id=${device.id} updated, phone=${cleaned}`);
            } else {
                console.error(`[Webhook wa-web] ❌ session.connected — no device found for sessionId=${sessionId}`);
            }
            return NextResponse.json({ success: true });
        }

        // ── session.disconnected ───────────────────────────────────
        if (event === 'session.disconnected') {
            await supabase
                .from('devices')
                .update({ status: 'disconnected' })
                .eq('session_id', sessionId);
            return NextResponse.json({ success: true });
        }

        // ── message.received ───────────────────────────────────────
        if (event === 'message.received') {
            const payload = data?.payload;
            console.log('[Webhook wa-web] message payload:', JSON.stringify(payload));

            if (!payload?.from) {
                console.warn('[Webhook wa-web] Missing from, skipping');
                return NextResponse.json({ success: true });
            }

            // Dedup: skip if this message ID was already processed
            // Use .ilike to match partial IDs since WAHA sometimes prefixes IDs (e.g., true_628123@c.us_ABCDEF)
            if (payload.id) {
                const { data: existing } = await supabase
                    .from('messages')
                    .select('id')
                    .ilike('wa_message_id', `%${payload.id}%`)
                    .maybeSingle();
                if (existing) {
                    console.log(`[Webhook wa-web] ⏭️ Skipping duplicate message ${payload.id}`);
                    return NextResponse.json({ success: true, duplicate: true });
                }
            }

            // Aggressively extract text content from any possible field format (Baileys/wa-web variants)
            const rawBody = payload.body || payload.text || payload.message?.conversation || payload.message?.extendedTextMessage?.text || payload._data?.body || '';
            let messageBody = typeof rawBody === 'string' ? rawBody : (JSON.stringify(rawBody) === '{}' ? '' : String(rawBody));
            
            // Clean up potentially weird text structures
            if (messageBody === '[object Object]') messageBody = '';

            const msgDirection = payload.direction || 'inbound';
            
            // Skip useless outbound echo from the bridge that has no content
            if (msgDirection === 'outbound' && !messageBody && !payload.mediaUrl && !payload.media_url) {
                console.log(`[Webhook wa-web] ⏭️ Skipping empty outbound echo from ${payload.from}`);
                return NextResponse.json({ success: true, skipped: 'empty_outbound' });
            }

            // Skip phantom inbound messages (bugs from the Baileys bridge that emit type: "text" but body is "")
            if (!messageBody && !payload.mediaUrl && !payload.media_url) {
                const rawMsg = payload._rawMessage;
                const isPhantom = !rawMsg || Object.keys(rawMsg).length === 0 || 
                    (rawMsg.protocolMessage !== undefined) || 
                    (rawMsg.senderKeyDistributionMessage !== undefined) ||
                    (rawMsg.messageContextInfo !== undefined && Object.keys(rawMsg).length === 1);
                
                if (isPhantom) {
                    console.log(`[Webhook wa-web] ⏭️ Skipping phantom empty payload from ${payload.from}`);
                    return NextResponse.json({ success: true, skipped: 'phantom_payload' });
                } else {
                    // It's a REAL message but we don't know how to parse its text!
                    // Dump it directly into the UI!
                    messageBody = `[UNPARSED_MSG] ` + JSON.stringify(rawMsg);
                }
            }

            const device = await findDevice(sessionId);
            if (!device) {
                console.error(`[Webhook wa-web] ❌ No device found for session_id="${sessionId}"`);
                return NextResponse.json({ success: false, error: 'device_not_found' });
            }

            console.log(`[Webhook wa-web] Found device id=${device.id} tenant_id=${device.tenant_id}`);

            // Clean phone number (handle WhatsApp JID extensions like 62812...:15@s.whatsapp.net)
            let rawPhone = payload.from;
            if (rawPhone && rawPhone.includes(':')) {
                rawPhone = rawPhone.split(':')[0] + '@s.whatsapp.net';
            }
            const phone = rawPhone.replace(/\D/g, '') || rawPhone;

            // Get or create contact safely — fetch tags for auto-reply filtering
            let contactId: string | null = null;
            let contactTags: string[] = [];
            const { data: existingContact } = await supabase
                .from('contacts')
                .select('id, tags')
                .eq('tenant_id', device.tenant_id)
                .eq('phone', phone)
                .maybeSingle();

            if (existingContact) {
                contactId = existingContact.id;
                contactTags = existingContact.tags || [];
            } else {
                const { data: newContact } = await supabase
                    .from('contacts')
                    .insert({ tenant_id: device.tenant_id, phone })
                    .select('id, tags')
                    .maybeSingle();
                if (newContact) {
                    contactId = newContact.id;
                    contactTags = newContact.tags || [];
                }
            }

            // Handle media: upload base64 data URL to Supabase Storage
            // Images are compressed before upload to save storage space
            let resolvedMediaUrl = payload.mediaUrl || payload.media_url || null;
            if (resolvedMediaUrl && resolvedMediaUrl.startsWith('data:')) {
                try {
                    const matches = resolvedMediaUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (matches) {
                        let mimeType = matches[1];
                        const base64Data = matches[2];
                        let buffer = Buffer.from(base64Data, 'base64');

                        // Compress images before upload to save storage
                        try {
                            const { compressImageBuffer } = await import('@/lib/image-compress');
                            const compressed = await compressImageBuffer(buffer, mimeType, { maxSizeKB: 300 });
                            buffer = Buffer.from(compressed.buffer);
                            mimeType = compressed.mimeType;
                        } catch (compressErr: any) {
                            console.warn('[Webhook wa-web] Image compression skipped:', compressErr.message);
                        }
                        
                        // Determine extension from mime
                        const extMap: Record<string, string> = {
                            'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
                            'video/mp4': 'mp4', 'video/3gpp': '3gp',
                            'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
                            'application/pdf': 'pdf',
                        };
                        const ext = extMap[mimeType] || 'bin';
                        const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 6)}.${ext}`;
                        const filePath = `inbox/inbound/${phone}/${filename}`;

                        const { error: uploadErr } = await supabase.storage
                            .from('inbox-media')
                            .upload(filePath, buffer, { contentType: mimeType, upsert: false });

                        if (!uploadErr) {
                            const { data: urlData } = supabase.storage
                                .from('inbox-media')
                                .getPublicUrl(filePath);
                            resolvedMediaUrl = urlData.publicUrl;
                            console.log(`[Webhook wa-web] ✅ Media uploaded: ${filePath} (${Math.round(buffer.length / 1024)}KB)`);
                        } else {
                            console.error('[Webhook wa-web] Media upload error:', uploadErr.message);
                            resolvedMediaUrl = null;
                        }
                    }
                } catch (mediaErr: any) {
                    console.error('[Webhook wa-web] Media processing error:', mediaErr.message);
                    resolvedMediaUrl = null;
                }
            }

            // Save message
            const { error: msgError } = await supabase.from('messages').insert({
                tenant_id: device.tenant_id,
                device_id: device.id,
                contact_id: contactId,
                phone,
                direction: msgDirection,
                content: messageBody || '[Media]',
                media_url: resolvedMediaUrl,
                message_type: payload.type || 'text',
                wa_message_id: payload.id || null,
            });

            if (msgError) {
                console.error('[Webhook wa-web] Message insert error:', msgError.message);
            } else {
                console.log(`[Webhook wa-web] ✅ Message saved from ${phone} (direction: ${msgDirection}): "${messageBody?.substring(0, 50) || '[Media]'}"`);
                
                // --- Generate Incoming Message Notification ---
                if (msgDirection === 'inbound') {
                    try {
                        await supabase.from('notifications').insert({
                            tenant_id: device.tenant_id,
                            device_id: device.id,
                            title: `Pesan Baru dari ${phone}`,
                            message: messageBody ? (messageBody.substring(0, 60) + (messageBody.length > 60 ? '...' : '')) : '[Media]',
                            type: 'incoming_message'
                        });
                    } catch (notifErr: any) {
                        console.error('[Webhook wa-web] Failed to generate notification:', notifErr.message);
                    }
                }
            }

            // ==================================================================
            // AUTO-REPLY ENGINE — only for inbound messages with content
            // ==================================================================
            if (msgDirection !== 'inbound') {
                console.log(`[AutoReply] Skipping outbound message from ${phone}`);
                return NextResponse.json({ success: true });
            }

            const message = (messageBody || '').toLowerCase().trim();
            console.log(`[AutoReply] Phone: ${phone}, Message: "${message}", Device: ${device.name} (${device.id})`);

            // Skip status messages
            const isStatus = payload.from === 'status@broadcast';
            if (isStatus) {
                return NextResponse.json({ success: true });
            }

            // 1. Intercept Unsubscribe Request
            if (message === 'unsub' || message === 'unsubscribe') {
                await supabase.from('blacklisted_contacts').upsert(
                    { tenant_id: device.tenant_id, phone, reason: 'unsubscribed via auto-reply keyword' },
                    { onConflict: 'tenant_id,phone' }
                );
                const replyText = 'Pesan diterima. Nomor Anda telah berhasil dihapus dari daftar. Anda tidak akan menerima rentetan pesan promosi dari kami lagi.';
                const wahaProvider = new WAHAProvider(device.provider_config as { apiUrl?: string; apiKey?: string });
                await wahaProvider.sendText(device.session_id, phone, replyText);
                return NextResponse.json({ success: true, unsubscribed: true });
            }

            // 2. Check auto-reply rules (ordered by priority desc)
            const { data: rules, error: rulesErr } = await supabase
                .from('autoreply_rules')
                .select('*')
                .eq('tenant_id', device.tenant_id)
                .eq('is_active', true)
                .or(`device_id.eq.${device.id},device_id.is.null`)
                .order('priority', { ascending: false });

            console.log(`[AutoReply] Rules found: ${rules?.length || 0}, Query error: ${rulesErr?.message || 'none'}`);

            if (!rules || rules.length === 0) {
                console.log('[AutoReply] No active rules found — skipping');
                return NextResponse.json({ success: true });
            }

            // Pre-fetch contact group memberships for filtering
            let contactGroupIds: string[] = [];
            if (contactId) {
                const { data: memberships } = await supabase
                    .from('contact_group_members')
                    .select('group_id')
                    .eq('contact_id', contactId);
                contactGroupIds = (memberships || []).map(m => m.group_id);
            }

            // Check blacklist status
            const { data: blacklisted } = await supabase
                .from('blacklisted_contacts')
                .select('id')
                .eq('tenant_id', device.tenant_id)
                .eq('phone', phone)
                .maybeSingle();
            const isBlacklisted = !!blacklisted;
            if (isBlacklisted) console.log(`[AutoReply] Phone ${phone} is BLACKLISTED — all rules skipped`);

            let matchedRule: typeof rules[0] | null = null;

            for (const rule of rules) {
                console.log(`[AutoReply] Checking rule: "${rule.name}" (type: ${rule.trigger_type}, priority: ${rule.priority})`);

                // a. Exclude: skip if sender is blacklisted
                if (isBlacklisted) { console.log(`[AutoReply]   → SKIP: blacklisted`); continue; }

                // b. Exclude phones
                const exPhones: string[] = rule.exclude_phones || [];
                if (exPhones.length > 0 && exPhones.some((ep: string) => phone.includes(ep.replace(/\D/g, '')))) { console.log(`[AutoReply]   → SKIP: exclude_phones`); continue; }

                // c. Exclude tags
                const exTags: string[] = rule.exclude_tags || [];
                if (exTags.length > 0 && exTags.some((et: string) => contactTags.includes(et))) { console.log(`[AutoReply]   → SKIP: exclude_tags`); continue; }

                // d. Target tags/groups (AND logic)
                const tTags: string[] = rule.target_tags || [];
                const tGroups: string[] = rule.target_group_ids || [];
                const hasTagFilter = tTags.length > 0;
                const hasGroupFilter = tGroups.length > 0;
                if (hasTagFilter || hasGroupFilter) {
                    const tagOk = !hasTagFilter || tTags.some((t: string) => contactTags.includes(t));
                    const groupOk = !hasGroupFilter || tGroups.some((g: string) => contactGroupIds.includes(g));
                    if (!tagOk || !groupOk) { console.log(`[AutoReply]   → SKIP: target filter`); continue; }
                }

                // --- Trigger matching ---
                if (rule.trigger_type === 'ai') {
                    console.log(`[AutoReply]   → MATCH: AI trigger (matches all messages)`);
                    matchedRule = rule;
                    break;
                }

                const trigger = (rule.trigger_value || '').toLowerCase();
                if (!trigger && rule.trigger_type !== 'ai') { console.log(`[AutoReply]   → SKIP: empty trigger`); continue; }

                if (rule.trigger_type === 'keyword') {
                    const keywords = trigger.split(',').map((k: string) => k.trim()).filter(Boolean);
                    if (keywords.some((kw: string) => message === kw)) { console.log(`[AutoReply]   → MATCH: keyword`); matchedRule = rule; break; }
                } else if (rule.trigger_type === 'contains') {
                    if (message.includes(trigger)) { console.log(`[AutoReply]   → MATCH: contains`); matchedRule = rule; break; }
                } else if (rule.trigger_type === 'regex') {
                    try {
                        if (new RegExp(trigger, 'i').test(message)) { console.log(`[AutoReply]   → MATCH: regex`); matchedRule = rule; break; }
                    } catch { }
                }
                console.log(`[AutoReply]   → NO MATCH`);
            }

            if (!matchedRule) {
                console.log('[AutoReply] No rule matched — no reply');
                return NextResponse.json({ success: true });
            }

            console.log(`[AutoReply] ✅ Matched rule: "${matchedRule.name}" → executing ${matchedRule.trigger_type} reply`);
            let replyText = '';

            if (matchedRule.trigger_type === 'ai') {
                // === AI Reply ===
                try {
                    // Load knowledge base (gracefully handles missing table)
                    let knowledgeFiles: { title: string; category: string; content: string }[] = [];
                    try {
                        const { data: kbData } = await supabase
                            .from('ai_knowledge_files')
                            .select('title, category, content')
                            .eq('rule_id', matchedRule.id)
                            .eq('is_active', true)
                            .order('category').order('title');
                        knowledgeFiles = kbData || [];
                    } catch {
                        console.log('[AutoReply] ai_knowledge_files table not available');
                    }

                    // Build enhanced system prompt
                    let fullSystemPrompt = matchedRule.ai_system_prompt || '';
                    if (knowledgeFiles.length > 0) {
                        const categoryLabels: Record<string, string> = {
                            product: '📦 Product Knowledge', company: '🏢 Company Info',
                            faq: '❓ FAQ', policy: '📋 Policy & Rules', general: '📄 General',
                        };
                        const knowledgeText = knowledgeFiles
                            .map(f => `### ${categoryLabels[f.category] || f.category} — ${f.title}\n${f.content}`)
                            .join('\n\n');
                        fullSystemPrompt += `\n\n=== KNOWLEDGE BASE ===\nGunakan informasi di bawah ini sebagai referensi utama.\n\n${knowledgeText}`;
                    }

                    const aiProvider = createAIProvider({
                        ai_base_url: matchedRule.ai_base_url,
                        ai_api_key: matchedRule.ai_api_key,
                        ai_model: matchedRule.ai_model,
                        ai_system_prompt: fullSystemPrompt,
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
                    const userMessage = messageBody || '[Pengguna mengirim media tanpa teks]';
                    const aiResponse = await aiProvider.conversate(history, userMessage);
                    replyText = aiResponse.content;
                    console.log(`[AutoReply] AI response (${replyText.length} chars): "${replyText.substring(0, 100)}..."`);

                    // Update conversation history
                    const newHistory: AIMessage[] = [
                        ...history,
                        { role: 'user', content: userMessage },
                        { role: 'assistant', content: replyText },
                    ];

                    await supabase.from('ai_conversations').upsert(
                        {
                            tenant_id: device.tenant_id, phone, device_id: device.id,
                            rule_id: matchedRule.id,
                            messages: newHistory.slice(-contextTurns * 2),
                            last_message_at: new Date().toISOString(),
                        },
                        { onConflict: 'tenant_id,phone,device_id' }
                    );
                } catch (aiErr: any) {
                    console.error('[AutoReply] ❌ AI reply error:', aiErr.message, aiErr.stack);
                    return NextResponse.json({ success: true, error: 'AI reply failed: ' + aiErr.message });
                }
            } else {
                replyText = matchedRule.response_text;
            }

            if (!replyText) {
                console.log('[AutoReply] Empty reply text — not sending');
                return NextResponse.json({ success: true });
            }

            // Auto-tagging logic: Extract [TAG: <name>] or [CLOSING_DEAL] from AI payload
            let tagsToAdd: string[] = [];
            const tagRegex = /\[TAG:\s*([^\]]+)\]/gi;
            let filteredReplyText = replyText.replace(tagRegex, (match, tagRaw) => {
                const tag = tagRaw.trim();
                if (tag) tagsToAdd.push(tag);
                return '';
            });
            
            // Allow basic [CLOSING_DEAL] as a hardcoded tag for simplicity
            const closingRegex = /\[CLOSING(?:_DEAL)?\]/gi;
            if (closingRegex.test(filteredReplyText)) {
                tagsToAdd.push('CLOSING_DEAL');
                filteredReplyText = filteredReplyText.replace(closingRegex, '');
            }

            replyText = filteredReplyText.trim();

            if (tagsToAdd.length > 0 && contactId) {
                const uniqueNewTags = [...new Set(tagsToAdd.map(t => t.toUpperCase()))];
                const updatedTags = [...new Set([...contactTags, ...uniqueNewTags])];
                
                await supabase.from('contacts').update({ tags: updatedTags }).eq('id', contactId);
                console.log(`[AutoReply] 🏷️ Auto-tagged contact ${phone} with:`, uniqueNewTags);

                // Add to dashboard notifications
                await supabase.from('notifications').insert({
                    tenant_id: device.tenant_id,
                    device_id: device.id,
                    title: `🎯 AI Auto-Tagging`,
                    message: `AI berhasil memberi label baru [${uniqueNewTags.join(', ')}] pada prospek ${phone}`,
                    type: 'info',
                    is_read: false
                }).then(({ error }) => {
                    if (error) console.error("[AutoReply] Notification err:", error);
                });
            }

            // Send reply via WAHA
            console.log(`[AutoReply] Sending reply to ${phone} via wa-web (${replyText.length} chars)`);
            const wahaProvider = new WAHAProvider(device.provider_config as { apiUrl?: string; apiKey?: string });
            const sendResult = await wahaProvider.sendText(device.session_id, phone, replyText);

            if (sendResult.success) {
                // Log outbound reply
                await supabase.from('messages').insert({
                    tenant_id: device.tenant_id,
                    device_id: device.id,
                    contact_id: contactId,
                    phone,
                    direction: 'outbound',
                    content: replyText,
                    message_type: 'text',
                    wa_message_id: sendResult.messageId || null,
                    is_from_bot: true
                });
                console.log(`[AutoReply] ✅ Reply sent successfully to ${phone}`);
            } else {
                console.error(`[AutoReply] ❌ Failed to send reply: ${sendResult.error}`);
            }

            return NextResponse.json({ success: true, autoReply: !!matchedRule });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[Webhook wa-web] Exception:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
