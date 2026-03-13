import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/inbox — Get conversation list (grouped by phone)
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

        // Get latest message per phone
        let query = supabase
            .from('messages')
            .select('*, contact:contacts(name, phone, tags), device:devices(id, name)')
            .order('created_at', { ascending: false });
            
        if (assignedDevices.length > 0) {
            query = query.in('device_id', assignedDevices);
        }

        const { data: messages, error } = await query;

        if (error) throw error;

        // Get unread counts by phone for inbound messages
        let unreadQuery = supabase
            .from('messages')
            .select('phone')
            .eq('direction', 'inbound')
            .eq('is_read', false);
            
        if (assignedDevices.length > 0) {
            unreadQuery = unreadQuery.in('device_id', assignedDevices);
        }

        const { data: unreadCounts } = await unreadQuery;
            
        const unreadMap = new Map<string, number>();
        (unreadCounts || []).forEach(m => {
            unreadMap.set(m.phone, (unreadMap.get(m.phone) || 0) + 1);
        });

        // Group by phone - take first (latest) per phone
        const seen = new Set<string>();
        const conversations = (messages || [])
            .filter(m => {
                if (seen.has(m.phone)) return false;
                seen.add(m.phone);
                return true;
            })
            .map(m => ({
                phone: m.phone,
                name: m.contact?.name || null,
                category: (m.contact?.tags && m.contact.tags.length > 0) ? m.contact.tags[0] : 'uncategorized',
                lastMessage: m.content?.substring(0, 60) || '[Media]',
                lastTime: m.created_at,
                unread: unreadMap.get(m.phone) || 0,
                deviceId: m.device?.id || null,
                deviceName: m.device?.name || '',
            }));

        const response = NextResponse.json({ success: true, data: conversations });
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        return response;
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
