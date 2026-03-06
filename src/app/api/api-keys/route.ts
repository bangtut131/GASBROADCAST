import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createHash, randomBytes } from 'crypto';

// GET /api/api-keys — list API keys
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data, error } = await supabase
            .from('api_keys')
            .select('id, name, key_prefix, permissions, is_active, last_used_at, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/api-keys — generate a new API key
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase
            .from('profiles')
            .select('tenant_id')
            .eq('id', user.id)
            .single();
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

        const body = await request.json();
        const { name, permissions } = body;

        if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

        // Generate secure API key
        const rawKey = `wab_${randomBytes(32).toString('hex')}`;
        const keyPrefix = rawKey.substring(0, 12);
        const keyHash = createHash('sha256').update(rawKey).digest('hex');

        const { data: apiKey, error } = await supabase
            .from('api_keys')
            .insert({
                tenant_id: profile.tenant_id,
                name,
                key_hash: keyHash,
                key_prefix: keyPrefix,
                permissions: permissions || ['send_message', 'read_contacts'],
                is_active: true,
            })
            .select('id, name, key_prefix, permissions, is_active, created_at')
            .single();

        if (error) throw error;

        // Return full key only once
        return NextResponse.json({
            success: true,
            data: { ...apiKey, key: rawKey },
            message: 'Simpan API key ini! Tidak akan ditampilkan lagi.',
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
