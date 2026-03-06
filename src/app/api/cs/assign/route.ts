import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/cs/assign — Assign conversation to agent / mark status
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { phone, agent_id, status } = await request.json();
        if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

        // Upsert cs assignment on contacts record
        const { error } = await supabase
            .from('contacts')
            .update({
                cs_assigned_to: agent_id || null,
                cs_status: status || (agent_id ? 'assigned' : 'unhandled'),
                cs_assigned_at: agent_id ? new Date().toISOString() : null,
            })
            .eq('phone', phone);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
