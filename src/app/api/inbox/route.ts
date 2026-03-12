import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/inbox — Get conversation list (grouped by phone)
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Get latest message per phone
        const { data: messages, error } = await supabase
            .from('messages')
            .select('*, contact:contacts(name, phone), device:devices(name)')
            .order('created_at', { ascending: false });

        if (error) throw error;

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
                lastMessage: m.content?.substring(0, 60) || '[Media]',
                lastTime: m.created_at,
                unread: 0,
                deviceName: m.device?.name || '',
            }));

        const response = NextResponse.json({ success: true, data: conversations });
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        return response;
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
