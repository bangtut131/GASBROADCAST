import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/wa-status/categories
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data, error } = await supabase
            .from('status_categories')
            .select('*, content_count:status_contents(count)')
            .order('name');

        if (error) throw error;
        const normalized = (data || []).map(c => ({
            ...c, content_count: c.content_count?.[0]?.count || 0,
        }));
        return NextResponse.json({ success: true, data: normalized });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/wa-status/categories
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

        const { name, color, icon } = await request.json();
        if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

        const { data, error } = await supabase
            .from('status_categories')
            .insert({ tenant_id: profile.tenant_id, name, color: color || '#6C63FF', icon: icon || '📁' })
            .select().single();

        if (error) throw error;
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
