import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getProvider } from '@/lib/wa-provider';

const STATUS_CHAT_ID = 'status@broadcast';

// POST /api/wa-status/post — Trigger posting a status update
// Supports multi-device: posts to ALL devices in the schedule's device_ids
export async function POST(request: NextRequest) {
    try {
        const supabase = await createServiceClient();

        // Allow cron auth via secret header OR regular user auth
        const cronSecret = request.headers.get('x-cron-secret');
        const isAuthorizedCron = cronSecret === process.env.CRON_SECRET;

        if (!isAuthorizedCron) {
            const { createClient } = await import('@/lib/supabase/server');
            const userClient = await createClient();
            const { data: { user } } = await userClient.auth.getUser();
            if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { schedule_id, content_id } = body;

        // Get schedule
        const { data: schedule } = await supabase
            .from('status_schedules')
            .select('*')
            .eq('id', schedule_id)
            .eq('is_active', true)
            .single();

        if (!schedule) return NextResponse.json({ error: 'Schedule not found or inactive' }, { status: 404 });

        // Resolve device_ids (backward compat: fall back to device_id)
        const deviceIds: string[] = (schedule.device_ids && schedule.device_ids.length > 0)
            ? schedule.device_ids
            : (schedule.device_id ? [schedule.device_id] : []);

        if (deviceIds.length === 0) {
            return NextResponse.json({ error: 'No devices configured for this schedule' }, { status: 400 });
        }

        // Get all devices
        const { data: devicesList } = await supabase
            .from('devices')
            .select('*')
            .in('id', deviceIds);

        const connectedDevices = (devicesList || []).filter(d => d.status === 'connected');
        if (connectedDevices.length === 0) {
            return NextResponse.json({ error: 'No connected devices' }, { status: 400 });
        }

        // Pick content (same content for all devices)
        let content;
        if (content_id) {
            const { data } = await supabase.from('status_contents').select('*').eq('id', content_id).single();
            content = data;
        } else {
            content = await pickContent(supabase, schedule);
        }

        if (!content) {
            return NextResponse.json({ error: 'No content available to post' }, { status: 400 });
        }

        // Pick caption template from array or fallback
        let selectedTemplate = schedule.caption_template || '';
        if (schedule.caption_templates && schedule.caption_templates.length > 0) {
            const templates = schedule.caption_templates;
            if (schedule.mode === 'sequence' || schedule.mode === 'manual') {
                const idx = (schedule.sequence_index || 0) % templates.length;
                selectedTemplate = templates[idx];
            } else {
                // Random mode
                selectedTemplate = templates[Math.floor(Math.random() * templates.length)];
            }
        }

        // Build caption with variables
        const caption = buildCaption(content.caption || selectedTemplate || '', content, selectedTemplate);

        // Post to ALL connected devices
        const results: { device_id: string; device_name: string; success: boolean; error?: string }[] = [];

        for (const device of connectedDevices) {
            try {
                const provider = getProvider(device.provider, device.provider_config as Record<string, string>);

                // Fetch tenant contacts
                const { data: contacts } = await supabase
                    .from('contacts')
                    .select('phone')
                    .eq('tenant_id', device.tenant_id)
                    .limit(2000);

                const contactPhones = (contacts || []).map((c: any) => c.phone);

                let result;
                if (content.type === 'image') {
                    result = await provider.sendStatusImage(device.session_id, content.content_url, caption, contactPhones);
                } else if (content.type === 'video') {
                    result = await provider.sendStatusVideo(device.session_id, content.content_url, caption, contactPhones);
                } else {
                    result = await provider.sendStatusText(device.session_id, caption || content.caption || '', '#1D4ED8', 1, contactPhones);
                }

                // Log per device
                await supabase.from('status_logs').insert({
                    tenant_id: device.tenant_id,
                    device_id: device.id,
                    schedule_id: schedule.id,
                    content_id: content.id,
                    status: result.success ? 'sent' : 'failed',
                    error_message: result.success ? null : result.error,
                    posted_at: new Date().toISOString(),
                });

                results.push({ device_id: device.id, device_name: device.name, success: result.success, error: result.error });
            } catch (err: any) {
                // Log failure for this device
                await supabase.from('status_logs').insert({
                    tenant_id: device.tenant_id,
                    device_id: device.id,
                    schedule_id: schedule.id,
                    content_id: content.id,
                    status: 'failed',
                    error_message: err.message,
                    posted_at: new Date().toISOString(),
                });
                results.push({ device_id: device.id, device_name: device.name, success: false, error: err.message });
            }
        }

        const anySuccess = results.some(r => r.success);

        if (anySuccess) {
            // Update content usage stats
            await supabase.from('status_contents').update({
                last_used_at: new Date().toISOString(),
                use_count: (content.use_count || 0) + 1,
            }).eq('id', content.id);

            // Update schedule stats
            const updates: Record<string, unknown> = {
                last_posted_at: new Date().toISOString(),
                total_posted: (schedule.total_posted || 0) + 1,
            };
            if (schedule.mode === 'sequence' || schedule.mode === 'manual') {
                updates.sequence_index = (schedule.sequence_index + 1);
            }
            await supabase.from('status_schedules').update(updates).eq('id', schedule.id);
        }

        return NextResponse.json({
            success: anySuccess,
            data: {
                content_id: content.id,
                content_title: content.title,
                results,
                total_devices: connectedDevices.length,
                success_count: results.filter(r => r.success).length,
                failed_count: results.filter(r => !r.success).length,
            },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// GET /api/wa-status/post — Check which schedules are due right now (for cron runner)
export async function GET(request: NextRequest) {
    try {
        const cronSecret = request.headers.get('x-cron-secret');
        if (cronSecret !== process.env.CRON_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = await createServiceClient();
        const now = new Date();

        const jakartaFormatter = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Jakarta',
            hour: '2-digit',
            minute: '2-digit',
            weekday: 'long',
        });
        const parts = jakartaFormatter.formatToParts(now);
        const currentTime = `${parts.find(p => p.type === 'hour')!.value}:${parts.find(p => p.type === 'minute')!.value}`;

        const jakartaDateStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short' });
        const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        const currentDay = dayMap[jakartaDateStr] ?? now.getDay();

        const { data: schedules } = await supabase
            .from('status_schedules')
            .select('*')
            .eq('is_active', true);

        const [curH, curM] = currentTime.split(':').map(Number);
        const curMinutes = curH * 60 + curM;

        const due = (schedules || []).filter(s => {
            if (!s.days_of_week.includes(currentDay)) return false;
            return s.times_of_day.some((t: string) => {
                const [h, m] = t.split(':').map(Number);
                return (h * 60 + m) === curMinutes;
            });
        });

        return NextResponse.json({ success: true, data: due });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ====== Helpers ======

async function pickContent(supabase: any, schedule: any) {
    if (schedule.mode === 'manual' && schedule.content_ids?.length > 0) {
        // Pick sequentially from the explicitly selected contents
        const idx = (schedule.sequence_index || 0) % schedule.content_ids.length;
        const targetId = schedule.content_ids[idx];
        const { data } = await supabase.from('status_contents')
            .select('*')
            .eq('id', targetId)
            .eq('is_active', true)
            .single();
        if (data) return data;
        
        // Fallback: If the specific content was deleted, just pick the first available one
        const { data: fallbackList } = await supabase.from('status_contents')
            .select('*')
            .in('id', schedule.content_ids)
            .eq('is_active', true)
            .limit(1);
            
        return fallbackList?.[0] || null;
    }

    const categoryFilter = schedule.category_ids?.length > 0
        ? schedule.category_ids : null;

    let query = supabase.from('status_contents').select('*').eq('tenant_id', schedule.tenant_id).eq('is_active', true);
    if (categoryFilter) query = query.in('category_id', categoryFilter);

    if (schedule.cooldown_days > 0) {
        const cooldownBoundary = new Date();
        cooldownBoundary.setDate(cooldownBoundary.getDate() - schedule.cooldown_days);
        query = query.or(`last_used_at.is.null,last_used_at.lt.${cooldownBoundary.toISOString()}`);
    }

    if (schedule.mode === 'sequence') query = query.order('created_at', { ascending: true });
    else query = query.order('use_count', { ascending: true });

    let { data: eligible, error } = await query;
    if (error) console.error('[wa-status/post] Query error getting content:', error);

    if (!eligible || eligible.length === 0) {
        let fallbackQuery = supabase.from('status_contents').select('*').eq('tenant_id', schedule.tenant_id).eq('is_active', true);
        if (categoryFilter) fallbackQuery = fallbackQuery.in('category_id', categoryFilter);

        if (schedule.mode === 'sequence') fallbackQuery = fallbackQuery.order('created_at', { ascending: true });
        else fallbackQuery = fallbackQuery.order('use_count', { ascending: true });

        const { data: fallback } = await fallbackQuery;
        eligible = fallback || [];
    }

    if (!eligible || eligible.length === 0) return null;

    if (schedule.mode === 'sequence') {
        const idx = (schedule.sequence_index || 0) % eligible.length;
        return eligible[idx];
    }

    return eligible[Math.floor(Math.random() * eligible.length)];
}

function buildCaption(template: string, content: any, scheduleTemplate?: string): string {
    const now = new Date();
    
    // Determine sapaan based on hour
    const hour = now.getHours();
    let sapaan = 'Selamat Malam';
    if (hour >= 3 && hour < 11) sapaan = 'Selamat Pagi';
    else if (hour >= 11 && hour < 15) sapaan = 'Selamat Siang';
    else if (hour >= 15 && hour < 18) sapaan = 'Selamat Sore';

    const vars: Record<string, string> = {
        hari: now.toLocaleDateString('id-ID', { weekday: 'long' }),
        tanggal: now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
        jam: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        judul: content.title || '',
        tag: (content.tags || []).join(' '),
        caption: content.caption || '',
        sapaan: sapaan,
    };

    // If a scheduleTemplate is explicitly passed (and it contains {caption}), we should base the replacement on scheduleTemplate
    // Otherwise, we just replace `template` (which might be the raw content.caption if schedule template is empty).
    const baseTemplate = (scheduleTemplate && scheduleTemplate.includes('{caption}')) 
                            ? scheduleTemplate 
                            : template;

    return Object.entries(vars).reduce(
        (str, [key, val]) => str.replace(new RegExp(`\\{${key}\\}`, 'g'), val),
        baseTemplate
    );
}
