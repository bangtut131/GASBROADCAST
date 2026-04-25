import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/wa-status/batch-callback
// Called by the bridge after batch status posting completes.
// Since POST /api/wa-status/post now optimistically marks logs as "sent",
// this callback is used primarily for ERROR CORRECTION:
// - If a device failed, update its log from "sent" to "failed"
// - If the whole batch failed, update all logs to "failed"
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
            // Whole batch failed — update all logs for this job to failed
            // (they were optimistically set to "sent" by the POST handler)
            console.error(`[batch-callback] Whole batch failed for job ${jobId}: ${error}`);
            await supabase
                .from('status_logs')
                .update({ status: 'failed', error_message: error })
                .eq('schedule_id', scheduleId)
                .eq('content_id', contentId)
                .in('status', ['pending', 'sent']);

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

            // Only update FAILED devices — successful ones were already marked "sent"
            const failedResults = results.filter((r: any) => !r.success);
            for (const r of failedResults) {
                const device = deviceMap.get(r.sessionId);
                if (!device) continue;

                console.log(`[batch-callback] Device ${device.name} (${r.sessionId}) failed: ${r.error}`);
                await supabase
                    .from('status_logs')
                    .update({
                        status: 'failed',
                        error_message: r.error || 'Bridge reported failure',
                    })
                    .eq('schedule_id', scheduleId)
                    .eq('content_id', contentId)
                    .eq('device_id', device.id)
                    .in('status', ['pending', 'sent']);
            }

            const successCount = results.filter((r: any) => r.success).length;
            const failedCount = failedResults.length;
            console.log(`[batch-callback] Job ${jobId}: ${successCount}/${results.length} succeeded, ${failedCount} failed`);

            // Note: schedule stats and content use_count are already updated
            // in POST /api/wa-status/post, so we don't update them here.

            return NextResponse.json({ success: true, successCount, failedCount, totalDevices: results.length });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('[batch-callback] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
