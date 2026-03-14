import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/inbox/statuses — Get unique contacts' statuses
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Get user role & assigned devices
        let assignedDevices: string[] = [];
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profile && (profile.role === 'agent' || profile.role === 'supervisor') && user.email) {
            const { data: member } = await supabase.from('team_members').select('assigned_devices').eq('email', user.email).single();
            if (member && member.assigned_devices && member.assigned_devices.length > 0) {
                assignedDevices = member.assigned_devices;
            }
        }

        // Get only status messages
        let query = supabase
            .from('messages')
            .select('*, contact:contacts(name, phone, tags), device:devices(id, name)')
            .eq('message_type', 'status')
            .order('created_at', { ascending: false });
            
        if (assignedDevices.length > 0) {
            query = query.in('device_id', assignedDevices);
        }

        const { data: messages, error } = await query;

        if (error) throw error;

        // Group statuses by phone
        const phonesSeen = new Set<string>();
        const statusGroups = [];

        for (const msg of (messages || [])) {
            if (!phonesSeen.has(msg.phone)) {
                phonesSeen.add(msg.phone);
                // Store the first one we see as the main representation for the list
                const userStatuses = (messages || []).filter(m => m.phone === msg.phone);
                statusGroups.push({
                    phone: msg.phone,
                    name: msg.contact?.name || null,
                    category: (msg.contact?.tags && msg.contact.tags.length > 0) ? msg.contact.tags[0] : 'uncategorized',
                    lastTime: msg.created_at,
                    deviceId: msg.device?.id || null,
                    deviceName: msg.device?.name || '',
                    statuses: userStatuses
                });
            }
        }

        const response = NextResponse.json({ success: true, data: statusGroups });
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        return response;
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
