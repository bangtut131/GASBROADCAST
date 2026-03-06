import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/dashboard/stats — Fetch real-time dashboard statistics
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        const [
            { count: totalContacts },
            { count: totalDevices },
            { count: connectedDevices },
            { count: totalCampaigns },
            { count: messagesSentToday },
            { count: messagesReceivedToday },
        ] = await Promise.all([
            supabase.from('contacts').select('*', { count: 'exact', head: true }),
            supabase.from('devices').select('*', { count: 'exact', head: true }),
            supabase.from('devices').select('*', { count: 'exact', head: true }).eq('status', 'connected'),
            supabase.from('campaigns').select('*', { count: 'exact', head: true }),
            supabase.from('messages').select('*', { count: 'exact', head: true }).eq('direction', 'outbound').gte('created_at', todayISO),
            supabase.from('messages').select('*', { count: 'exact', head: true }).eq('direction', 'inbound').gte('created_at', todayISO),
        ]);

        // Recent campaigns
        const { data: recentCampaigns } = await supabase
            .from('campaigns')
            .select('id, name, status, sent_count, total_recipients, created_at')
            .order('created_at', { ascending: false })
            .limit(5);

        return NextResponse.json({
            success: true,
            data: {
                totalContacts: totalContacts || 0,
                totalDevices: totalDevices || 0,
                connectedDevices: connectedDevices || 0,
                totalCampaigns: totalCampaigns || 0,
                messagesSentToday: messagesSentToday || 0,
                messagesReceivedToday: messagesReceivedToday || 0,
                recentCampaigns: recentCampaigns || [],
            },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
