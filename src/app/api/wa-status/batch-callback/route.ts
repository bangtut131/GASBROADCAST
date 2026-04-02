import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/wa-status/batch-callback
// Called by the bridge after batch status posting completes
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { jobId, results, error } = body;

        if (!jobId) {
            return NextResponse.json({ error: 'jobId required' }, { status: 400 });
        }

        console.log(`[batch-callback] Received callback for job ${jobId}`, 
            results ? `${results.length} results` : `error: ${error}`);

        const supabase = await createServiceClient();

        // Parse jobId format: "scheduleId:contentId:timestamp"
        const [scheduleId, contentId] = jobId.split(':');

        if (error) {
            // Whole batch failed - update all pending logs for this job
            await supabase
                .from('status_logs')
                .update({ status: 'failed', error_message: error })
                .eq('schedule_id', scheduleId)
                .eq('content_id', contentId)
                .eq('status', 'pending');

            return NextResponse.json({ success: true, updated: 'all-failed' });
        }

        if (results && Array.isArray(results)) {
            // Get the schedule to map session_id -> device_id
            const { data: schedule } = await supabase
                .from('status_schedules')
                .select('device_ids, device_id, tenant_id')
                .eq('id', scheduleId)
                .single();

            if (!schedule) {
                console.error(`[batch-callback] Schedule not found: ${scheduleId}`);
                return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
            }

            const deviceIdsToFetch = (schedule.device_ids && schedule.device_ids.length > 0)
                ? schedule.device_ids
                : (schedule.device_id ? [schedule.device_id] : []);

            // Get devices to map session_id -> device
            const { data: devices } = await supabase
                .from('devices')
                .select('id, session_id, name')
                .in('id', deviceIdsToFetch);

            const deviceMap = new Map((devices || []).map(d => [d.session_id, d]));

            // Update each device's log
            for (const r of results) {
                const device = deviceMap.get(r.sessionId);
                if (!device) continue;

                await supabase
                    .from('status_logs')
                    .update({
                        status: r.success ? 'sent' : 'failed',
                        error_message: r.success ? null : r.error,
                    })
                    .eq('schedule_id', scheduleId)
                    .eq('content_id', contentId)
                    .eq('device_id', device.id)
                    .eq('status', 'pending');
            }

            const successCount = results.filter((r: any) => r.success).length;
            console.log(`[batch-callback] Job ${jobId}: ${successCount}/${results.length} succeeded`);

            // Update schedule stats if any succeeded
            if (successCount > 0) {
                const { data: sched } = await supabase
                    .from('status_schedules')
                    .select('total_posted, sequence_index, mode')
                    .eq('id', scheduleId)
                    .single();

                if (sched) {
                    const updates: Record<string, unknown> = {
                        last_posted_at: new Date().toISOString(),
                        total_posted: (sched.total_posted || 0) + 1,
                    };
                    if (sched.mode === 'sequence' || sched.mode === 'manual') {
                        updates.sequence_index = (sched.sequence_index || 0) + 1;
                    }
                    await supabase.from('status_schedules').update(updates).eq('id', scheduleId);
                }

                // Note: content last_used_at and use_count are updated optimistically
                // in POST /api/wa-status/post BEFORE fire-and-forget, so we don't update here
                // to avoid double-counting.
            }

            return NextResponse.json({ success: true, successCount, totalDevices: results.length });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('[batch-callback] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
