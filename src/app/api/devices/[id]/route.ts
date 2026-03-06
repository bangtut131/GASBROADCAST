import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProvider } from '@/lib/wa-provider';

// GET /api/devices/[id] — Get single device  
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: device, error } = await supabase
            .from('devices')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !device) return NextResponse.json({ error: 'Device not found' }, { status: 404 });
        return NextResponse.json({ success: true, data: device });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH /api/devices/[id] — Update device (name, status)
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { data: device, error } = await supabase
            .from('devices')
            .update(body)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data: device });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE /api/devices/[id] — Delete device & end WA session
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: device } = await supabase
            .from('devices')
            .select('*')
            .eq('id', id)
            .single();

        if (device?.provider === 'waha' && device.session_id) {
            try {
                const provider = getProvider('waha', {
                    apiUrl: (device.provider_config as any)?.apiUrl,
                    apiKey: (device.provider_config as any)?.apiKey,
                });
                await provider.deleteSession(device.session_id);
            } catch { /* ignore if WAHA not available */ }
        }

        await supabase.from('devices').delete().eq('id', id);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
