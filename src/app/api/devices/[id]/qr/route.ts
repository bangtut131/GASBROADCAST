import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProvider } from '@/lib/wa-provider';

// GET /api/devices/[id]/qr — Get QR code for WAHA or WA Web device
export async function GET(
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

        if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 });

        if (device.provider !== 'waha' && device.provider !== 'wa-web') {
            return NextResponse.json({ error: 'QR only available for WAHA/WA Web provider' }, { status: 400 });
        }

        const provider = getProvider(device.provider as any, {
            apiUrl: (device.provider_config as any)?.apiUrl,
            apiKey: (device.provider_config as any)?.apiKey,
        });

        const qr = await provider.getQRCode(device.session_id);
        return NextResponse.json({ success: true, data: { qr } });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
