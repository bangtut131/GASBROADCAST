import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/wa-status/schedules
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: schedules, error } = await supabase
            .from('status_schedules')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Resolve device info for each schedule
        const allDeviceIds = new Set<string>();
        for (const s of (schedules || [])) {
            const ids: string[] = (s.device_ids && s.device_ids.length > 0) ? s.device_ids : (s.device_id ? [s.device_id] : []);
            ids.forEach(id => allDeviceIds.add(id));
        }

        let devicesMap: Record<string, any> = {};
        if (allDeviceIds.size > 0) {
            const { data: devices } = await supabase
                .from('devices')
                .select('id, name, phone_number, status, provider')
                .in('id', Array.from(allDeviceIds));
            for (const d of (devices || [])) {
                devicesMap[d.id] = d;
            }
        }

        // Attach devices array to each schedule
        const enriched = (schedules || []).map(s => {
            const ids: string[] = (s.device_ids && s.device_ids.length > 0) ? s.device_ids : (s.device_id ? [s.device_id] : []);
            return {
                ...s,
                device_ids: ids,
                devices: ids.map(id => devicesMap[id]).filter(Boolean),
                // Keep single device for backward compat
                device: ids.length > 0 ? devicesMap[ids[0]] : null,
            };
        });

        return NextResponse.json({ success: true, data: enriched });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/wa-status/schedules — Create a SINGLE schedule with multiple devices
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

        const body = await request.json();
        const {
            name, device_id, device_ids, mode, category_ids, times_of_day,
            days_of_week, window_start, window_end, timezone,
            cooldown_days, caption_template,
        } = body;

        // Support both single device_id and multi device_ids
        const selectedDeviceIds: string[] = device_ids?.length > 0
            ? device_ids
            : device_id ? [device_id] : [];

        if (!name || selectedDeviceIds.length === 0) {
            return NextResponse.json({ error: 'name and at least one device required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('status_schedules')
            .insert({
                tenant_id: profile.tenant_id,
                device_id: selectedDeviceIds[0],  // Primary device (backward compat)
                device_ids: selectedDeviceIds,     // All devices
                name,
                mode: mode || 'random',
                category_ids: category_ids || [],
                times_of_day: times_of_day || ['08:00'],
                days_of_week: days_of_week ?? [0, 1, 2, 3, 4, 5, 6],
                window_start: window_start || '07:00',
                window_end: window_end || '21:00',
                timezone: timezone || 'Asia/Jakarta',
                cooldown_days: cooldown_days ?? 3,
                caption_template: caption_template || null,
                is_active: true,
            })
            .select()
            .single();

        if (error) throw error;

        // Resolve device info
        const { data: devices } = await supabase
            .from('devices')
            .select('id, name, phone_number, status')
            .in('id', selectedDeviceIds);

        return NextResponse.json({
            success: true,
            data: {
                ...data,
                devices: devices || [],
                device: devices?.[0] || null,
            },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
