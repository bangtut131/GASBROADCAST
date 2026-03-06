import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProvider, formatPhone } from '@/lib/wa-provider';

// POST /api/inbox/send — Send a manual reply from inbox
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { phone, message, device_id } = await request.json();
        if (!phone || !message) return NextResponse.json({ error: 'phone and message required' }, { status: 400 });

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
        const result = await provider.sendText(device.session_id, formatPhone(phone), message);

        if (!result.success) throw new Error(result.error);

        // Save to messages table
        const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
        const { data: contact } = await supabase.from('contacts').select('id').eq('phone', phone).single();

        await supabase.from('messages').insert({
            tenant_id: profile?.tenant_id,
            device_id: device.id,
            contact_id: contact?.id || null,
            phone,
            direction: 'outbound',
            message_type: 'text',
            content: message,
            is_from_bot: false,
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
