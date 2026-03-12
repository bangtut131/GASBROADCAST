import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Webhook handler for GAS Smart Broadcast Baileys Bridge (wa-web provider)
 * The bridge sends incoming messages to this endpoint.
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
            console.warn('[Webhook wa-web] Invalid payload — missing sessionId or event');
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        console.log(`[Webhook wa-web] event=${event} sessionId=${sessionId}`);

        const supabase = await createClient();

        // session.connected — update device status in DB
        if (event === 'session.connected') {
            const { error } = await supabase
                .from('devices')
                .update({ status: 'connected', phone_number: data?.phoneNumber || null })
                .eq('session_id', sessionId);
            console.log(`[Webhook wa-web] session.connected update → error:`, error?.message || 'none');
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

            if (!payload?.from) {
                console.warn('[Webhook wa-web] No "from" in payload');
                return NextResponse.json({ success: true });
            }
            if (!payload?.body) {
                console.warn('[Webhook wa-web] Empty body — skipping');
                return NextResponse.json({ success: true });
            }

            // Find device by session_id
            const { data: device, error: deviceError } = await supabase
                .from('devices')
                .select('id, tenant_id')
                .eq('session_id', sessionId)
                .single();

            if (deviceError || !device) {
                console.error(`[Webhook wa-web] Device not found for session_id="${sessionId}". Error:`, deviceError?.message);
                // Return 200 so bridge doesn't retry, but log the issue
                return NextResponse.json({ success: false, error: 'device_not_found', sessionId });
            }

            console.log(`[Webhook wa-web] Found device id=${device.id} tenant_id=${device.tenant_id}`);

            // Upsert contact
            const { error: contactError } = await supabase.from('contacts').upsert({
                tenant_id: device.tenant_id,
                phone: payload.from,
            }, { onConflict: 'tenant_id, phone' });
            if (contactError) console.warn('[Webhook wa-web] Contact upsert error:', contactError.message);

            // Save message
            const { error: msgError } = await supabase.from('messages').insert({
                tenant_id: device.tenant_id,
                device_id: device.id,
                phone: payload.from,
                direction: 'inbound',
                content: payload.body,
                message_type: payload.type || 'text',
                external_id: payload.id,
            });

            if (msgError) {
                console.error('[Webhook wa-web] Message insert error:', msgError.message);
            } else {
                console.log(`[Webhook wa-web] ✅ Message saved from ${payload.from}`);
            }

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[Webhook wa-web] Exception:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
