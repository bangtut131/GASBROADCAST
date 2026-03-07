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
        const apiUrl = (cfg?.apiUrl || '').replace(/\/$/, '');
        const apiKey = cfg?.apiKey || '';
        const sessionId = device.session_id;

        if (!apiUrl || !sessionId) {
            return NextResponse.json({ success: true, data: { qr: null, debug: 'missing apiUrl or sessionId' } });
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
        };

        // Step 1: Check session status first
        let sessionStatus: string | null = null;
        try {
            const statusRes = await fetch(`${apiUrl}/api/${sessionId}/status`, {
                headers,
                signal: AbortSignal.timeout(5000),
            });
            if (statusRes.ok) {
                const statusData = await statusRes.json();
                sessionStatus = statusData?.data?.status || statusData?.status || null;
            }
        } catch (e: any) {
            console.log('[QR] Status check failed:', e.message);
        }

        // Step 2: If session connected, update DB
        if (sessionStatus === 'connected') {
            await supabase.from('devices').update({ status: 'connected' }).eq('id', id);
            return NextResponse.json({ success: true, data: { qr: null, status: 'connected' } });
        }

        // Step 3: Try to get QR
        const qrRes = await fetch(`${apiUrl}/api/${sessionId}/auth/qr`, {
            headers,
            signal: AbortSignal.timeout(8000),
        });

        // Session not found on bridge — try to start it
        if (qrRes.status === 404 || qrRes.status === 401) {
            let startError = '';
            try {
                const startRes = await fetch(`${apiUrl}/api/sessions/${sessionId}/start`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({}),
                    signal: AbortSignal.timeout(8000),
                });
                if (!startRes.ok) {
                    const err = await startRes.text();
                    startError = `start ${startRes.status}: ${err}`;
                }
            } catch (e: any) {
                startError = e.message;
            }
            return NextResponse.json({
                success: true,
                data: {
                    qr: null,
                    debug: `Session started (was 404). startError: ${startError || 'none'}. Retry in 5s.`,
                },
            });
        }

        if (!qrRes.ok) {
            const errText = await qrRes.text();
            return NextResponse.json({
                success: true,
                data: { qr: null, debug: `Bridge QR error ${qrRes.status}: ${errText}` },
            });
        }

        const qrData = await qrRes.json();
        console.log('[QR] Bridge response:', JSON.stringify(qrData).substring(0, 100));

        if (qrData.status === 'connected' || sessionStatus === 'connected') {
            await supabase.from('devices').update({ status: 'connected' }).eq('id', id);
            return NextResponse.json({ success: true, data: { qr: null, status: 'connected' } });
        }

        return NextResponse.json({
            success: true,
            data: {
                qr: qrData.qr || null,
                debug: `sessionStatus=${sessionStatus}, bridgeStatus=${qrData.status}`,
            },
        });
    } catch (error: any) {
        console.error('[QR] Error:', error.message);
        return NextResponse.json({ success: true, data: { qr: null, debug: `error: ${error.message}` } });
    }
}
