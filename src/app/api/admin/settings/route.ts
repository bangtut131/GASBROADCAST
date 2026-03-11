import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/admin/settings — Read platform settings (public)
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('platform_settings')
            .select('key, value');

        if (error) throw error;

        const settings: Record<string, string> = {};
        (data || []).forEach(row => { settings[row.key] = row.value; });

        return NextResponse.json({ success: true, data: settings });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH /api/admin/settings — Update platform settings (owner only)
export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();
        if (!profile || profile.role !== 'owner') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const updates: Record<string, string> = await request.json();

        for (const [key, value] of Object.entries(updates)) {
            await supabase
                .from('platform_settings')
                .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
