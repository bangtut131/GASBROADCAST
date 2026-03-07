import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProvider } from '@/lib/wa-provider';

// GET /api/devices — List all devices for the current tenant
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: devices, error } = await supabase
            .from('devices')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ success: true, data: devices });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/devices — Create a new device & start WA session
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Get tenant_id from profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('tenant_id')
            .eq('id', user.id)
            .single();
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

        const body = await request.json();
        const { name, provider, provider_config } = body;

        if (!name || !provider) {
            return NextResponse.json({ error: 'name and provider are required' }, { status: 400 });
        }

        // Generate session ID
        const sessionId = `${profile.tenant_id.substring(0, 8)}-${Date.now()}`;

        // Insert device record
        const { data: device, error: insertError } = await supabase
            .from('devices')
            .insert({
                tenant_id: profile.tenant_id,
                name,
                provider,
                provider_config: provider_config || {},
                session_id: (provider === 'waha' || provider === 'wa-web') ? sessionId : (provider_config?.phoneNumberId || ''),
                status: 'qr_pending',
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // If WAHA or WA Web (bridge): create session and wait for QR
        if (provider === 'waha' || provider === 'wa-web') {
            try {
                const waProvider = getProvider(provider as any, {
                    apiUrl: provider_config?.apiUrl,
                    apiKey: provider_config?.apiKey,
                });
                await waProvider.createSession({ provider, name: sessionId });
            } catch (waError: any) {
                // Non-fatal: user can retry QR later
                console.warn(`${provider} session creation failed:`, waError.message);
            }
        }


        return NextResponse.json({ success: true, data: device });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
