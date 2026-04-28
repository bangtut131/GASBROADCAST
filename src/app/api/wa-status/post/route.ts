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

        // Get schedule (for manual "Post Sekarang", allow inactive schedules too)
        const scheduleQuery = supabase
            .from('status_schedules')
            .select('*')
            .eq('id', schedule_id);

        // Only filter active for cron-triggered posts
        if (isAuthorizedCron) {
            scheduleQuery.eq('is_active', true);
        }

        const { data: schedule, error: schedError } = await scheduleQuery.single();

        if (!schedule) {
            console.error('[wa-status/post] Schedule not found:', schedule_id, schedError?.message);
            return NextResponse.json({ error: 'Schedule not found' + (schedError ? `: ${schedError.message}` : '') }, { status: 404 });
        }

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

        // NATIVE APPROACH: Don't send contact list from database.
        // The bridge collects device contacts automatically via Baileys contacts.upsert events.
        // This is exactly how WA Web works — status is visible to whoever is in
        // the phone's contact list, following WhatsApp's own privacy rules.
        // No manual contact list injection needed.

        // Use the first device's provider config (all devices share same bridge)
        const firstDevice = connectedDevices[0];
        const provider = getProvider(firstDevice.provider, firstDevice.provider_config as Record<string, string>) as any;

        if ((content.type === 'image' || content.type === 'video') && typeof provider.batchSendStatusImage === 'function') {
            // ====== FIRE-AND-FORGET BATCH MODE ======
            // 1. Create pending logs for all devices
            // 2. Send batch request to bridge (responds immediately)
            // 3. Bridge processes in background and calls back with results

            const jobId = `${schedule.id}:${content.id}:${Date.now()}`;
            const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL 
                || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:3000');
            const callbackUrl = `${appBaseUrl}/api/wa-status/batch-callback`;

            // Insert pending logs for all devices
            const pendingLogs = connectedDevices.map(d => ({
                tenant_id: d.tenant_id,
                device_id: d.id,
                schedule_id: schedule.id,
                content_id: content.id,
                status: 'pending',
                error_message: null,
                posted_at: new Date().toISOString(),
            }));
            await supabase.from('status_logs').insert(pendingLogs);

            // Optimistically mark content as used IMMEDIATELY (before fire-and-forget).
            // This prevents race condition: if another schedule triggers 15 min later,
            // pickContent() will see this content's last_used_at is recent and skip it.
            await supabase.from('status_contents').update({
                last_used_at: new Date().toISOString(),
                use_count: (content.use_count || 0) + 1,
            }).eq('id', content.id);

            // Send batch request (fire-and-forget — bridge responds immediately)
            try {
                const deviceEntries = connectedDevices.map(d => ({
                    sessionId: d.session_id,
                    contacts: [],  // Empty — bridge uses device contacts automatically (native approach)
                }));

                if (content.type === 'image') {
                    await provider.batchSendStatusImage(content.content_url, caption, deviceEntries, callbackUrl, jobId);
                } else {
                    await provider.batchSendStatusVideo(content.content_url, caption, deviceEntries, callbackUrl, jobId);
                }

                // Bridge accepted the batch — optimistically mark all pending as "sent".
                // This prevents status staying "pending" forever when callback fails
                // (e.g. bridge can't reach Next.js app URL, network issues, etc.)
                // If bridge later reports failure via callback, it will update to "failed".
                console.log(`[wa-status/post] Bridge accepted job ${jobId} — marking ${connectedDevices.length} device(s) as sent`);
                await supabase
                    .from('status_logs')
                    .update({ status: 'sent', error_message: null })
                    .eq('schedule_id', schedule.id)
                    .eq('content_id', content.id)
                    .eq('status', 'pending');

                // Update schedule stats immediately
                const schedUpdates: Record<string, unknown> = {
                    last_posted_at: new Date().toISOString(),
                    total_posted: (schedule.total_posted || 0) + 1,
                };
                if (schedule.mode === 'sequence' || schedule.mode === 'manual') {
                    schedUpdates.sequence_index = (schedule.sequence_index || 0) + 1;
                }
                await supabase.from('status_schedules').update(schedUpdates).eq('id', schedule.id);

                // === Storage cleanup: delete the media file after posting ===
                // The bridge downloads the file when we send the batch request,
                // so we can safely delete the Supabase Storage copy after a short delay.
                // The content_url in DB stays (points to deleted file), but that's OK
                // because wa-status files are temporary by nature.
                if (content.storage_path || content.content_url?.includes('/storage/v1/object/public/wa-status/')) {
                    const storagePath = content.storage_path ||
                        content.content_url.split('/storage/v1/object/public/wa-status/')[1];
                    if (storagePath) {
                        // Fire-and-forget: delete from storage after 60s delay
                        // (give bridge time to download the file first)
                        setTimeout(async () => {
                            try {
                                const delClient = await createServiceClient();
                                await delClient.storage.from('wa-status').remove([decodeURIComponent(storagePath)]);
                                console.log(`[wa-status/post] 🗑️ Cleaned up storage: ${storagePath}`);
                            } catch (delErr: any) {
                                console.warn(`[wa-status/post] Storage cleanup failed (non-fatal): ${delErr.message}`);
                            }
                        }, 60_000);
                    }
                }

                return NextResponse.json({
                    success: true,
                    accepted: true,
                    data: {
                        content_id: content.id,
                        content_title: content.title,
                        total_devices: connectedDevices.length,
                        message: `Status berhasil dikirim ke ${connectedDevices.length} device`,
                    },
                });
            } catch (err: any) {
                // Batch request itself failed — update logs to failed
                console.error(`[wa-status/post] Batch request failed for job: ${err.message}`);
                await supabase
                    .from('status_logs')
                    .update({ status: 'failed', error_message: err.message })
                    .eq('schedule_id', schedule.id)
                    .eq('content_id', content.id)
                    .eq('status', 'pending');

                return NextResponse.json({
                    success: false,
                    error: `Gagal mengirim batch: ${err.message}`,
                });
            }
        } else {
            // ====== SYNC MODE: text status (fast, no media download) ======
            for (const device of connectedDevices) {
                try {
                    const devProvider = getProvider(device.provider, device.provider_config as Record<string, string>);
                    const result = await devProvider.sendStatusText(device.session_id, caption || content.caption || '', '#1D4ED8', 1, []);  // Empty — bridge uses device contacts (native)

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
                await supabase.from('status_contents').update({
                    last_used_at: new Date().toISOString(),
                    use_count: (content.use_count || 0) + 1,
                }).eq('id', content.id);

                const updates: Record<string, unknown> = {
                    last_posted_at: new Date().toISOString(),
                    total_posted: (schedule.total_posted || 0) + 1,
                };
                if (schedule.mode === 'sequence' || schedule.mode === 'manual') {
                    updates.sequence_index = (schedule.sequence_index + 1);
                }
                await supabase.from('status_schedules').update(updates).eq('id', schedule.id);
            }

            const successCount = results.filter(r => r.success).length;
            const failedCount = results.filter(r => !r.success).length;
            const failedErrors = results.filter(r => !r.success).map(r => `${r.device_name}: ${r.error}`);

            return NextResponse.json({
                success: anySuccess,
                error: anySuccess ? undefined : `Gagal di ${failedCount} device: ${failedErrors.join('; ')}`,
                data: {
                    content_id: content.id,
                    content_title: content.title,
                    results,
                    total_devices: connectedDevices.length,
                    success_count: successCount,
                    failed_count: failedCount,
                },
            });
        }
    } catch (error: any) {
        console.error('[wa-status/post] Unhandled error:', error.message, error.stack);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
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
