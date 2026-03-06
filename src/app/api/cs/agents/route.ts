import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/cs/agents — List CS agents (from profiles)
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, email, role, is_active')
            .order('full_name');

        if (error) throw error;
        const agents = (data || []).map(p => ({
            id: p.id,
            name: p.full_name || p.email || 'Unknown',
            email: p.email || '',
            role: p.role || 'agent',
            is_active: p.is_active !== false,
        }));
        return NextResponse.json({ success: true, data: agents });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
