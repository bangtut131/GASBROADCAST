import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSuperAdmin } from '@/lib/admin';

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

        if (!isSuperAdmin(user.email ?? undefined)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const updates: Record<string, string> = await request.json();
        const errors: string[] = [];

        for (const [key, value] of Object.entries(updates)) {
            // Try update first (rows should already exist from seed)
            const { data: updated, error: updateErr } = await supabase
                .from('platform_settings')
                .update({ value, updated_at: new Date().toISOString() })
                .eq('key', key)
                .select();

            if (updateErr) {
                errors.push(`${key}: ${updateErr.message}`);
                continue;
            }

            // If no row was updated (key doesn't exist), insert it
            if (!updated || updated.length === 0) {
                const { error: insertErr } = await supabase
                    .from('platform_settings')
                    .insert({ key, value, updated_at: new Date().toISOString() });
                if (insertErr) errors.push(`${key}: ${insertErr.message}`);
            }
        }

        if (errors.length > 0) {
            return NextResponse.json({ success: false, error: errors.join('; ') }, { status: 500 });
        }
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
