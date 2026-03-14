import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/notifications
// Get all notifications for the current tenant
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const searchParams = request.nextUrl.searchParams;
        const unreadOnly = searchParams.get('unread') === 'true';

        // Get tenant mapping
        const { data: profile } = await supabase
            .from('profiles')
            .select('tenant_id')
            .eq('id', user.id)
            .single();

        if (!profile?.tenant_id) {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }

        let query = supabase
            .from('notifications')
            .select('*')
            .eq('tenant_id', profile.tenant_id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (unreadOnly) {
            query = query.eq('is_read', false);
        }

        const { data, error } = await query;

        if (error) throw error;
        
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH /api/notifications
// Mark notifications as read
export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase
            .from('profiles')
            .select('tenant_id')
            .eq('id', user.id)
            .single();

        if (!profile?.tenant_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

        const body = await request.json();
        const { id, markAllRead } = body;

        let query = supabase.from('notifications').update({ is_read: true });

        if (markAllRead) {
            query = query.eq('tenant_id', profile.tenant_id).eq('is_read', false);
        } else if (id) {
            query = query.eq('id', id).eq('tenant_id', profile.tenant_id);
        } else {
            return NextResponse.json({ error: 'Missing id or markAllRead flag' }, { status: 400 });
        }

        const { error } = await query;
        if (error) throw error;

        return NextResponse.json({ success: true, message: 'Updated successfully' });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
