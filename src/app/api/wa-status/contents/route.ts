import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/wa-status/contents — list content library
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const category_id = searchParams.get('category_id');
        const type = searchParams.get('type');
        const search = searchParams.get('search') || '';

        let query = supabase
            .from('status_contents')
            .select('*, category:status_categories(id, name, color, icon)')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (category_id) query = query.eq('category_id', category_id);
        if (type) query = query.eq('type', type);
        if (search) query = query.ilike('title', `%${search}%`);

        const { data, error } = await query;
        if (error) throw error;
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/wa-status/contents — add content
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

        const body = await request.json();
        const { type, title, content_url, caption, category_id, tags } = body;

        if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 });
        if (type !== 'text' && !content_url) return NextResponse.json({ error: 'content_url required for image/video' }, { status: 400 });

        const { data, error } = await supabase
            .from('status_contents')
            .insert({ tenant_id: profile.tenant_id, type, title, content_url, caption, category_id: category_id || null, tags: tags || [] })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
