import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/analytics?period=30d
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || '30d';
        const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

        const since = new Date();
        since.setDate(since.getDate() - days);
        const sinceISO = since.toISOString();

        // Parallel queries
        const [
            { data: messages },
            { data: contacts },
            { data: campaigns },
            { count: totalContacts },
        ] = await Promise.all([
            supabase.from('messages').select('direction, created_at').gte('created_at', sinceISO),
            supabase.from('contacts').select('created_at').gte('created_at', sinceISO),
            supabase.from('campaigns').select('name, sent_count, failed_count, total_recipients, status').gte('created_at', sinceISO),
            supabase.from('contacts').select('*', { count: 'exact', head: true }),
        ]);

        // Build daily message volume
        const volumeMap: Record<string, { inbound: number; outbound: number }> = {};
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const key = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
            volumeMap[key] = { inbound: 0, outbound: 0 };
        }
        (messages || []).forEach(m => {
            const key = new Date(m.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
            if (volumeMap[key]) volumeMap[key][m.direction as 'inbound' | 'outbound']++;
        });
        const messageVolume = Object.entries(volumeMap).map(([date, v]) => ({ date, ...v }));

        // Contact growth (cumulative)
        const contactGrowthMap: Record<string, number> = {};
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const key = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
            contactGrowthMap[key] = 0;
        }
        (contacts || []).forEach(c => {
            const key = new Date(c.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
            if (contactGrowthMap[key] !== undefined) contactGrowthMap[key]++;
        });
        let cumulative = (totalContacts || 0) - (contacts?.length || 0);
        const contactGrowth = Object.entries(contactGrowthMap).map(([date, added]) => {
            cumulative += added;
            return { date, total: cumulative };
        });

        // Campaign stats
        const campaignStats = (campaigns || []).slice(0, 10).map(c => ({
            name: c.name.substring(0, 15) + (c.name.length > 15 ? '...' : ''),
            sent: c.sent_count || 0,
            failed: c.failed_count || 0,
            total: c.total_recipients || 0,
        }));

        // Status distribution
        const statusMap: Record<string, number> = {};
        (campaigns || []).forEach(c => {
            statusMap[c.status] = (statusMap[c.status] || 0) + 1;
        });
        const statusLabels: Record<string, string> = { completed: 'Selesai', running: 'Berjalan', draft: 'Draft', scheduled: 'Terjadwal', failed: 'Gagal' };
        const statusDistribution = Object.entries(statusMap).map(([k, v]) => ({ name: statusLabels[k] || k, value: v }));

        // Summary
        const totalMessages = messages?.length || 0;
        const totalSent = (campaigns || []).reduce((a, c) => a + (c.sent_count || 0), 0);
        const totalAllRecipients = (campaigns || []).reduce((a, c) => a + (c.total_recipients || 0), 0);
        const avgDeliveryRate = totalAllRecipients > 0 ? (totalSent / totalAllRecipients) * 100 : 0;

        return NextResponse.json({
            success: true,
            data: {
                messageVolume,
                contactGrowth,
                campaignStats,
                statusDistribution,
                summary: {
                    totalMessages,
                    totalCampaigns: campaigns?.length || 0,
                    totalContacts: totalContacts || 0,
                    avgDeliveryRate,
                },
            },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
