import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

        const cfg = device.provider_config as any;
        const apiUrl = cfg?.apiUrl || '';
        const apiKey = cfg?.apiKey || '';
        const sessionId = device.session_id;

        if (!apiUrl || !sessionId) {
            return NextResponse.json({ success: true, data: { qr: null } });
        }

        // For wa-web/waha: fetch QR from bridge/WAHA
        // If session not found (404), try to start it first
        const qrUrl = `${apiUrl}/api/${sessionId}/auth/qr`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers['x-api-key'] = apiKey;

        let qrRes = await fetch(qrUrl, { headers, signal: AbortSignal.timeout(8000) });

        // Session not found on bridge — restart it
        if (qrRes.status === 404) {
            try {
                await fetch(`${apiUrl}/api/sessions/${sessionId}/start`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({}),
                    signal: AbortSignal.timeout(5000),
                });
                // Wait 2s for Baileys to init
                await new Promise(r => setTimeout(r, 2000));
                qrRes = await fetch(qrUrl, { headers, signal: AbortSignal.timeout(8000) });
            } catch {
                // Return null QR — client will retry in 5s
                return NextResponse.json({ success: true, data: { qr: null } });
            }
        }

        if (!qrRes.ok) {
            return NextResponse.json({ success: true, data: { qr: null } });
        }

        const data = await qrRes.json();

        // If connected, update device status in DB
        if (data.status === 'connected') {
            await supabase.from('devices').update({ status: 'connected' }).eq('id', id);
            return NextResponse.json({ success: true, data: { qr: null, status: 'connected' } });
        }

        return NextResponse.json({ success: true, data: { qr: data.qr || null } });
    } catch (error: any) {
        console.error('[QR] Error:', error.message);
        // Never return 500 for QR — client will retry
        return NextResponse.json({ success: true, data: { qr: null } });
    }
}
