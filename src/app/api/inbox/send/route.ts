import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProvider, formatPhone } from '@/lib/wa-provider';

// POST /api/inbox/send — Send a manual reply from inbox (text or media)
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { phone, message, device_id, media_url, media_type, filename } = await request.json();
        if (!phone) return NextResponse.json({ error: 'phone is required' }, { status: 400 });
        if (!message && !media_url) return NextResponse.json({ error: 'message or media_url required' }, { status: 400 });

        // Find first connected device to send from (or use specified device_id)
        const { data: device } = await supabase
            .from('devices')
            .select('*')
            .eq('status', 'connected')
            .eq(device_id ? 'id' : 'status', device_id || 'connected')
            .limit(1)
            .single();

        if (!device) return NextResponse.json({ error: 'No connected device available' }, { status: 400 });

        const provider = getProvider(device.provider, device.provider_config as Record<string, string>);
        const formattedPhone = formatPhone(phone);
        let result;

        // Send based on media type
        if (media_url && media_type) {
            switch (media_type) {
                case 'image':
                    result = await provider.sendImage(device.session_id, formattedPhone, media_url, message || undefined);
                    break;
                case 'video':
                    result = await provider.sendVideo(device.session_id, formattedPhone, media_url, message || undefined);
                    break;
                case 'document':
                    result = await provider.sendDocument(device.session_id, formattedPhone, media_url, filename || 'document');
                    break;
                default:
                    // For audio or unknown, send as document
                    result = await provider.sendDocument(device.session_id, formattedPhone, media_url, filename || 'file');
                    break;
            }
        } else {
            // Text-only message
            result = await provider.sendText(device.session_id, formattedPhone, message);
        }

        if (!result.success) throw new Error(result.error);

        // Save to messages table
        const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle();
        const { data: contact } = await supabase.from('contacts').select('id').eq('phone', phone).maybeSingle();

        const { error: msgErr } = await supabase.from('messages').insert({
            tenant_id: profile?.tenant_id,
            device_id: device.id,
            contact_id: contact?.id || null,
            phone,
            direction: 'outbound',
            message_type: media_type || 'text',
            content: message || null,
            media_url: media_url || null,
            is_from_bot: false,
        });
        if (msgErr) console.error('[Inbox Send] Message insert error:', msgErr.message);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
