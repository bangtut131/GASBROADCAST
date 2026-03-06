import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/contacts/groups — list groups with member counts
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: groups, error } = await supabase
            .from('contact_groups')
            .select(`
        *,
        member_count: contact_group_members(count)
      `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Normalize count
        const normalized = (groups || []).map(g => ({
            ...g,
            member_count: g.member_count?.[0]?.count || 0,
        }));

        return NextResponse.json({ success: true, data: normalized });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/contacts/groups — create group
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
        const { name, description, contact_ids } = body;

        if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

        const { data: group, error } = await supabase
            .from('contact_groups')
            .insert({ tenant_id: profile.tenant_id, name, description })
            .select()
            .single();

        if (error) throw error;

        // Add members if provided
        if (contact_ids && contact_ids.length > 0) {
            await supabase.from('contact_group_members').insert(
                contact_ids.map((cid: string) => ({ contact_id: cid, group_id: group.id }))
            );
        }

        return NextResponse.json({ success: true, data: group });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
