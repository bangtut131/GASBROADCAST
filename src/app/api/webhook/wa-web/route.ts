import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

        const supabase = await createClient();

        // Helper: find device by session_id first, then by phone_number as fallback
        async function findDevice(sid: string, phoneNumber?: string) {
            // Try by session_id
            const { data: bySession } = await supabase
                .from('devices')
                .select('id, tenant_id, session_id, phone_number')
                .eq('session_id', sid)
                .maybeSingle();
            if (bySession) return bySession;

            // Fallback: try by phone_number if provided
            if (phoneNumber) {
                const cleaned = phoneNumber.replace(/\D/g, '');
                const { data: byPhone } = await supabase
                    .from('devices')
                    .select('id, tenant_id, session_id, phone_number')
                    .eq('phone_number', cleaned)
                    .maybeSingle();
                if (byPhone) {
                    console.log(`[Webhook wa-web] Found device by phone_number=${cleaned}, updating session_id`);
                    // Update session_id to match current bridge session
                    await supabase
                        .from('devices')
                        .update({ session_id: sid })
                        .eq('id', byPhone.id);
                    return byPhone;
                }
            }
            return null;
        }

        // session.connected — update device status in DB
        if (event === 'session.connected') {
            const phoneNumber = data?.phoneNumber;
            const device = await findDevice(sessionId, phoneNumber);
            if (device) {
                await supabase
                    .from('devices')
                    .update({ status: 'connected', phone_number: phoneNumber || null, session_id: sessionId })
                    .eq('id', device.id);
                console.log(`[Webhook wa-web] session.connected — device id=${device.id} updated`);
            } else {
                console.warn(`[Webhook wa-web] session.connected — no device found for sessionId=${sessionId}, phone=${phoneNumber}`);
            }
            return NextResponse.json({ success: true });
        }

        // session.disconnected
        if (event === 'session.disconnected') {
            await supabase
                .from('devices')
                .update({ status: 'disconnected' })
                .eq('session_id', sessionId);
            return NextResponse.json({ success: true });
        }

        // message.received — save to messages table
        if (event === 'message.received') {
            const payload = data?.payload;
            console.log('[Webhook wa-web] message payload:', JSON.stringify(payload));

            if (!payload?.from || !payload?.body) {
                console.warn('[Webhook wa-web] Missing from or body, skipping');
                return NextResponse.json({ success: true });
            }

            const device = await findDevice(sessionId);
            if (!device) {
                console.error(`[Webhook wa-web] Device not found for session_id="${sessionId}"`);
                return NextResponse.json({ success: false, error: 'device_not_found' });
            }

            console.log(`[Webhook wa-web] Found device id=${device.id} tenant_id=${device.tenant_id}`);

            // Clean phone number
            const phone = payload.from.replace(/\D/g, '') || payload.from;

            // Upsert contact
            await supabase.from('contacts').upsert({
                tenant_id: device.tenant_id,
                phone,
            }, { onConflict: 'tenant_id, phone' });

            // Save message
            const { error: msgError } = await supabase.from('messages').insert({
                tenant_id: device.tenant_id,
                device_id: device.id,
                phone,
                direction: 'inbound',
                content: payload.body,
                message_type: payload.type || 'text',
                external_id: payload.id,
            });

            if (msgError) {
                console.error('[Webhook wa-web] Message insert error:', msgError.message);
            } else {
                console.log(`[Webhook wa-web] ✅ Message saved from ${phone}`);
            }

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[Webhook wa-web] Exception:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
