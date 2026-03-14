import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const searchParams = new URL(request.url).searchParams;
        const period = searchParams.get('period') || '30d';
        const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

        const since = new Date();
        since.setDate(since.getDate() - days);
        const sinceISO = since.toISOString();

        // 1. Get user's tenant ID
        const { data: profile } = await supabase
            .from('profiles')
            .select('tenant_id')
            .eq('id', user.id)
            .single();

        if (!profile?.tenant_id) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

        // 2. Fetch all required messages and devices in parallel
        const [
            { data: messages },
            { data: devices },
            { count: unreadCount }
        ] = await Promise.all([
            supabase
                .from('messages')
                .select('id, direction, is_from_bot, device_id, phone, created_at')
                .eq('tenant_id', profile.tenant_id)
                .gte('created_at', sinceISO),
            supabase
                .from('devices')
                .select('id, name, phone_number')
                .eq('tenant_id', profile.tenant_id),
            supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', profile.tenant_id)
                .eq('direction', 'inbound')
                .eq('is_read', false)
        ]);

        const msgs = messages || [];
        const inboundMsgs = msgs.filter(m => m.direction === 'inbound');
        const outboundMsgs = msgs.filter(m => m.direction === 'outbound');

        // --- Metric 1: Volume Masuk vs Keluar per Hari ---
        const volumeMap: Record<string, { inbound: number; outbound: number }> = {};
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const key = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
            volumeMap[key] = { inbound: 0, outbound: 0 };
        }
        msgs.forEach(m => {
            const key = new Date(m.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
            if (volumeMap[key]) volumeMap[key][m.direction as 'inbound' | 'outbound']++;
        });
        const volume = Object.entries(volumeMap).map(([date, v]) => ({ date, ...v }));

        // --- Metric 2: Bot vs Human Replies ---
        const botCount = outboundMsgs.filter(m => m.is_from_bot).length;
        const humanCount = outboundMsgs.length - botCount;

        // --- Metric 3: Peak Hours (Jam Sibuk) ---
        // Only count inbound messages for peak hours
        const hoursMap = new Array(24).fill(0);
        inboundMsgs.forEach(m => {
            const hour = new Date(m.created_at).getHours();
            hoursMap[hour]++;
        });
        const peakHours = hoursMap.map((count, hour) => ({
            hour: `${hour.toString().padStart(2, '0')}:00`,
            count
        }));

        // --- Metric 4: Device Load (Beban Nomor Pengirim) ---
        const deviceMap: Record<string, number> = {};
        (devices || []).forEach(d => deviceMap[d.id] = 0);
        
        inboundMsgs.forEach(m => {
            if (m.device_id && deviceMap[m.device_id] !== undefined) {
                deviceMap[m.device_id]++;
            }
        });

        const deviceLoad = (devices || []).map(d => ({
            name: d.name || d.phone_number || 'Unknown',
            value: deviceMap[d.id] || 0
        })).filter(d => d.value > 0); // Only show devices that actually received messages

        // --- Metric 5: Unreplied Messages (Belum Dibalas) ---
        // Group messages by phone, find the latest message per phone, and check if it's inbound
        const latestMsgByPhone: Record<string, typeof msgs[0]> = {};
        msgs.forEach(m => {
            if (m.phone && (!latestMsgByPhone[m.phone] || new Date(m.created_at) > new Date(latestMsgByPhone[m.phone].created_at))) {
                latestMsgByPhone[m.phone] = m;
            }
        });
        
        let unrepliedCount = 0;
        Object.values(latestMsgByPhone).forEach(latestMsg => {
            if (latestMsg.direction === 'inbound') {
                unrepliedCount++;
            }
        });

        return NextResponse.json({
            success: true,
            data: {
                volume,
                botVsHuman: [
                    { name: 'Bot (Auto)', value: botCount },
                    { name: 'CS (Manual)', value: humanCount }
                ].filter(d => d.value > 0),
                peakHours,
                deviceLoad,
                summary: {
                    totalInbound: inboundMsgs.length,
                    totalOutbound: outboundMsgs.length,
                    unreadInbox: unreadCount || 0,
                    unrepliedInbox: unrepliedCount,
                    botHandlingRate: outboundMsgs.length > 0 ? (botCount / outboundMsgs.length) * 100 : 0
                }
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
