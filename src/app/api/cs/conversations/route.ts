import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/cs/conversations — Conversations with CS assignment status
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Get latest message per phone with CS assignment from contacts
        const { data: messages } = await supabase
            .from('messages')
            .select('*, contact:contacts(name, cs_assigned_to, cs_status), device:devices(name)')
            .eq('direction', 'inbound')
            .order('created_at', { ascending: false });

        const seen = new Set<string>();
        const conversations = (messages || [])
            .filter(m => {
                if (seen.has(m.phone)) return false;
                seen.add(m.phone);
                return true;
            })
            .map(m => {
                const contact = m.contact;
                return {
                    phone: m.phone,
                    name: contact?.name || null,
                    lastMessage: (m.content || '[Media]').substring(0, 80),
                    lastTime: m.created_at,
                    assignedTo: contact?.cs_assigned_to || null,
                    agentName: null, // resolved on client by cross-referencing agents
                    status: (contact?.cs_status || 'unhandled') as 'unhandled' | 'assigned' | 'resolved',
                };
            });

        return NextResponse.json({ success: true, data: conversations });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
