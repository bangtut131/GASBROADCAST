import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/wa-status/schedules
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data, error } = await supabase
            .from('status_schedules')
            .select('*, device:devices(id, name, phone_number, status, provider)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/wa-status/schedules
// Supports both single device_id (legacy) and device_ids[] (multi-device)
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

        // Create one schedule per device (fan-out)
        const scheduleBase = {
            tenant_id: profile.tenant_id,
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
        };

        const results = [];
        for (const devId of selectedDeviceIds) {
            const { data, error } = await supabase
                .from('status_schedules')
                .insert({ ...scheduleBase, device_id: devId })
                .select('*, device:devices(id, name, phone_number, status)')
                .single();

            if (error) throw error;
            results.push(data);
        }

        // Return single object for single device, array for multiple
        return NextResponse.json({
            success: true,
            data: results.length === 1 ? results[0] : results,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
