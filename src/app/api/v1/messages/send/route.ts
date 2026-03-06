import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey, hasPermission } from '@/lib/api-auth';
import { getProvider, formatPhone } from '@/lib/wa-provider';

// POST /api/v1/messages/send — Send WA message via Public REST API
export async function POST(request: NextRequest) {
    const auth = await verifyApiKey(request);
    if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!hasPermission(auth, 'send_message')) {
        return NextResponse.json({ error: 'Permission denied: send_message required' }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { to, message, device_id, media_url, media_type } = body;

        if (!to || !message) {
            return NextResponse.json({ error: '"to" and "message" are required', status: 400 }, { status: 400 });
        }

        const { supabase, tenantId } = auth;

        // Get a connected device (specific or first available)
        let devQuery = supabase
            .from('devices')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('status', 'connected');

        if (device_id) devQuery = devQuery.eq('id', device_id);

        const { data: device } = await devQuery.limit(1).single();

        if (!device) {
            return NextResponse.json({ error: 'No connected WhatsApp device found' }, { status: 400 });
        }

        const provider = getProvider(device.provider, device.provider_config as Record<string, string>);
        const formattedTo = formatPhone(to);

        let result;
        if (media_type === 'image' && media_url) {
            result = await provider.sendImage(device.session_id, formattedTo, media_url, message);
        } else if (media_type === 'document' && media_url) {
            result = await provider.sendDocument(device.session_id, formattedTo, media_url, 'document');
        } else if (media_type === 'video' && media_url) {
            result = await provider.sendVideo(device.session_id, formattedTo, media_url, message);
        } else {
            result = await provider.sendText(device.session_id, formattedTo, message);
        }

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        // Log to messages inbox
        await supabase.from('messages').insert({
            tenant_id: tenantId,
            device_id: device.id,
            phone: formattedTo,
            direction: 'outbound',
            message_type: media_type || 'text',
            content: message,
            wa_message_id: result.messageId,
        });

        return NextResponse.json({
            success: true,
            data: { message_id: result.messageId, to: formattedTo, status: 'sent' },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
