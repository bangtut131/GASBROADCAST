import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getProvider } from '@/lib/wa-provider';

const STATUS_CHAT_ID = 'status@broadcast';

// POST /api/wa-status/post — Trigger posting a status update
// Called by: manual trigger or cron job
export async function POST(request: NextRequest) {
    try {
        const supabase = await createServiceClient();

        // Allow cron auth via secret header OR regular user auth
        const cronSecret = request.headers.get('x-cron-secret');
        const isAuthorizedCron = cronSecret === process.env.CRON_SECRET;

        if (!isAuthorizedCron) {
            // Fall back to regular user auth
            const { createClient } = await import('@/lib/supabase/server');
            const userClient = await createClient();
            const { data: { user } } = await userClient.auth.getUser();
            if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { schedule_id, content_id } = body;

        // Get schedule with device
        const { data: schedule } = await supabase
            .from('status_schedules')
            .select('*, device:devices(*)')
            .eq('id', schedule_id)
            .eq('is_active', true)
            .single();

        if (!schedule) return NextResponse.json({ error: 'Schedule not found or inactive' }, { status: 404 });

        const device = schedule.device;
        if (!device || device.status !== 'connected') {
            return NextResponse.json({ error: 'Device not connected' }, { status: 400 });
        }

        // Pick content
        let content;
        if (content_id) {
            // Manual selection
            const { data } = await supabase.from('status_contents').select('*').eq('id', content_id).single();
            content = data;
        } else {
            // Auto-pick based on mode
            content = await pickContent(supabase, schedule);
        }

        if (!content) {
            return NextResponse.json({ error: 'No content available to post' }, { status: 400 });
        }

        // Build caption with variables
        const caption = buildCaption(content.caption || schedule.caption_template || '', content);

        // Post to WA Status via provider using DEDICATED status endpoints
        // IMPORTANT: Do NOT use sendText/sendImage/sendVideo with status@broadcast —
        // that approach silently fails or creates mass DMs instead of Status updates
        const provider = getProvider(device.provider, device.provider_config as Record<string, string>);

        // Fetch tenant contacts to distribute the status to
        const { data: contacts } = await supabase
            .from('contacts')
            .select('phone')
            .eq('tenant_id', device.tenant_id)
            .limit(2000);

        const contactPhones = (contacts || []).map(c => c.phone);

        let result;

        if (content.type === 'image') {
            result = await provider.sendStatusImage(device.session_id, content.content_url, caption, contactPhones);
        } else if (content.type === 'video') {
            result = await provider.sendStatusVideo(device.session_id, content.content_url, caption, contactPhones);
        } else {
            // Text status
            result = await provider.sendStatusText(device.session_id, caption || content.caption || '', '#1D4ED8', 1, contactPhones);
        }

        // Log the result
        await supabase.from('status_logs').insert({
            tenant_id: device.tenant_id,
            device_id: device.id,
            schedule_id: schedule.id,
            content_id: content.id,
            status: result.success ? 'sent' : 'failed',
            error_message: result.success ? null : result.error,
            posted_at: new Date().toISOString(),
        });

        if (result.success) {
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
            // Advance sequence index if in sequence mode
            if (schedule.mode === 'sequence') {
                updates.sequence_index = (schedule.sequence_index + 1);
            }
            await supabase.from('status_schedules').update(updates).eq('id', schedule.id);
        }

        return NextResponse.json({
            success: result.success,
            data: { content_id: content.id, content_title: content.title, posted: result.success },
            error: result.success ? undefined : result.error,
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

        // Use Asia/Jakarta timezone for all time comparisons
        const jakartaFormatter = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Jakarta',
            hour: '2-digit',
            minute: '2-digit',
            weekday: 'long',
        });
        const parts = jakartaFormatter.formatToParts(now);
        const currentTime = `${parts.find(p => p.type === 'hour')!.value}:${parts.find(p => p.type === 'minute')!.value}`;

        // Day of week in Jakarta time (0=Sun, 1=Mon, ..., 6=Sat)
        const jakartaDateStr = now.toLocaleDateString('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short' });
        const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        const currentDay = dayMap[jakartaDateStr] ?? now.getDay();

        // Get all active schedules
        const { data: schedules } = await supabase
            .from('status_schedules')
            .select('*')
            .eq('is_active', true);

        const [curH, curM] = currentTime.split(':').map(Number);
        const curMinutes = curH * 60 + curM;

        const due = (schedules || []).filter(s => {
            // Check if current day (Jakarta) is in schedule
            if (!s.days_of_week.includes(currentDay)) return false;
            // Check if current time matches one of the posting times (exact minute match)
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
    const categoryFilter = schedule.category_ids?.length > 0
        ? schedule.category_ids : null;

    // First pass: Try to find content respecting the cooldown setup
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

    // Second pass: If NO content is available because of cooldown, ignore cooldown
    // Better to post repeated content than throw "No content available" error
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
        // Get content at current sequence_index (wrap around)
        const idx = (schedule.sequence_index || 0) % eligible.length;
        return eligible[idx];
    }

    // Random mode: pick randomly from eligible
    return eligible[Math.floor(Math.random() * eligible.length)];
}

function buildCaption(template: string, content: any): string {
    const now = new Date();
    const vars: Record<string, string> = {
        hari: now.toLocaleDateString('id-ID', { weekday: 'long' }),
        tanggal: now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
        jam: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        judul: content.title || '',
        tag: (content.tags || []).join(' '),
    };

    return Object.entries(vars).reduce(
        (str, [key, val]) => str.replace(new RegExp(`\\{${key}\\}`, 'g'), val),
        template
    );
}
