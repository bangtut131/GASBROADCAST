import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Webhook handler for GasBroadcast Baileys Bridge (wa-web provider)
 * The bridge sends incoming messages to this endpoint.
 * We reuse the same event processing as the WAHA webhook.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate API secret from bridge
        const apiKey = request.headers.get('x-api-key');
        const expectedSecret = process.env.BRIDGE_API_SECRET || process.env.CRON_SECRET;
        if (expectedSecret && apiKey !== expectedSecret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { sessionId, event, data } = body;
        if (!sessionId || !event) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const supabase = await createClient();

        // session.connected — update device status in DB
        if (event === 'session.connected') {
            await supabase
                .from('devices')
                .update({ status: 'connected', phone_number: data?.phoneNumber || null })
                .eq('session_id', sessionId);
            return NextResponse.json({ success: true });
        }

        // message.received — save to messages table and trigger auto-reply
        if (event === 'message.received') {
            const payload = data?.payload;
            if (!payload?.from || !payload?.body) return NextResponse.json({ success: true });

            // Find device by session_id
            const { data: device } = await supabase
                .from('devices')
                .select('id, tenant_id')
                .eq('session_id', sessionId)
                .single();

            if (!device) return NextResponse.json({ success: true });

            // Upsert contact
            await supabase.from('contacts').upsert({
                tenant_id: device.tenant_id,
                phone: payload.from,
            }, { onConflict: 'tenant_id, phone' });

            // Save message
            await supabase.from('messages').insert({
                tenant_id: device.tenant_id,
                device_id: device.id,
                phone: payload.from,
                direction: 'inbound',
                content: payload.body,
                message_type: payload.type || 'text',
                external_id: payload.id,
            });

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
