import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/devices/health — Check real-time health of all devices via bridge
// Returns bridge-level session status, decrypt errors, and device contacts count
// Also updates device status in DB if bridge reports different state
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Get all devices for current tenant
        const { data: devices, error } = await supabase
            .from('devices')
            .select('id, session_id, name, status, provider, provider_config')
            .order('created_at', { ascending: false });

        if (error) throw error;
        if (!devices || devices.length === 0) {
            return NextResponse.json({ success: true, data: [] });
        }

        const results = [];

        for (const device of devices) {
            const config = device.provider_config as Record<string, string> | null;
            const apiUrl = config?.apiUrl || process.env.WAHA_API_URL || '';
            const apiKey = config?.apiKey || process.env.WAHA_API_KEY || '';

            if (!apiUrl || !device.session_id) {
                results.push({
                    deviceId: device.id,
                    name: device.name,
                    dbStatus: device.status,
                    bridgeStatus: 'unknown',
                    isHealthy: null,
                    decryptErrorCount: 0,
                    deviceContacts: 0,
                    error: 'No bridge URL configured',
                });
                continue;
            }

            try {
                const res = await fetch(`${apiUrl}/api/${device.session_id}/health`, {
                    headers: { 'x-api-key': apiKey },
                    signal: AbortSignal.timeout(5000), // 5s timeout
                });

                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const health = await res.json();

                // Determine the real status
                let realStatus = device.status;
                let statusChanged = false;

                if (!health.exists) {
                    // Session doesn't exist on bridge at all
                    realStatus = 'disconnected';
                } else if (health.status !== 'connected') {
                    // Bridge says not connected
                    realStatus = health.status === 'qr' ? 'qr_pending' : 'disconnected';
                } else if (!health.isHealthy) {
                    // Connected but corrupted (decrypt errors)
                    realStatus = 'unhealthy';
                } else {
                    realStatus = 'connected';
                }

                // Update DB if status changed
                if (realStatus !== device.status) {
                    statusChanged = true;
                    await supabase
                        .from('devices')
                        .update({ status: realStatus })
                        .eq('id', device.id);
                }

                results.push({
                    deviceId: device.id,
                    name: device.name,
                    dbStatus: device.status,
                    bridgeStatus: health.status || 'unknown',
                    realStatus,
                    statusChanged,
                    isHealthy: health.isHealthy ?? true,
                    decryptErrorCount: health.decryptErrorCount || 0,
                    deviceContacts: health.deviceContacts || 0,
                });
            } catch (err: any) {
                // Bridge unreachable — mark as disconnected
                if (device.status === 'connected') {
                    await supabase
                        .from('devices')
                        .update({ status: 'disconnected' })
                        .eq('id', device.id);
                }

                results.push({
                    deviceId: device.id,
                    name: device.name,
                    dbStatus: device.status,
                    bridgeStatus: 'unreachable',
                    realStatus: 'disconnected',
                    statusChanged: device.status === 'connected',
                    isHealthy: false,
                    decryptErrorCount: 0,
                    deviceContacts: 0,
                    error: err.message,
                });
            }
        }

        // ── Cleanup orphaned sessions on bridge ──
        // Send valid session IDs to bridge so it can delete zombie sessions
        // that exist on disk but were deleted from the database
        const validSessionIds = devices
            .filter(d => d.session_id)
            .map(d => d.session_id as string);
        
        if (validSessionIds.length > 0 && devices[0]) {
            const config = devices[0].provider_config as Record<string, string> | null;
            const apiUrl = config?.apiUrl || process.env.WAHA_API_URL || '';
            const apiKey = config?.apiKey || process.env.WAHA_API_KEY || '';
            if (apiUrl) {
                try {
                    await fetch(`${apiUrl}/api/sessions/cleanup`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'x-api-key': apiKey,
                        },
                        body: JSON.stringify({ validSessionIds }),
                        signal: AbortSignal.timeout(5000),
                    });
                } catch { /* cleanup is non-critical */ }
            }
        }

        return NextResponse.json({ success: true, data: results });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
