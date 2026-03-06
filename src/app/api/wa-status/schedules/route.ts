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
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

        const body = await request.json();
        const {
            name, device_id, mode, category_ids, times_of_day,
            days_of_week, window_start, window_end, timezone,
            cooldown_days, caption_template,
        } = body;

        if (!name || !device_id) return NextResponse.json({ error: 'name and device_id required' }, { status: 400 });

        const { data, error } = await supabase
            .from('status_schedules')
            .insert({
                tenant_id: profile.tenant_id,
                device_id, name, mode: mode || 'random',
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
            .select('*, device:devices(name, phone_number)')
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
