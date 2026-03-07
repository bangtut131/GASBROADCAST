/**
 * Next.js Instrumentation Hook
 * Runs once when the server starts — sets up background cron scheduler.
 * This replaces the need for any external cron service.
 *
 * Timezone: All scheduling uses Asia/Jakarta (WIB, UTC+7)
 */

export async function register() {
    // Only run in Node.js runtime (not Edge), and only once (not per-worker)
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;
    if ((global as any).__cronRegistered) return;
    (global as any).__cronRegistered = true;

    const { default: cron } = await import('node-cron');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const cronSecret = process.env.CRON_SECRET || '';

    console.log('[Cron] Internal scheduler started — timezone: Asia/Jakarta');

    // ─── WA Status Auto-Post ───────────────────────────────────────────────
    // Runs every minute, checks if any WA status schedules are due (in WIB)
    cron.schedule('* * * * *', async () => {
        try {
            // Step 1: GET — which schedules are due right now?
            const res = await fetch(`${appUrl}/api/wa-status/post`, {
                method: 'GET',
                headers: {
                    'x-cron-secret': cronSecret,
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(10000),
            });

            if (!res.ok) return;

            const data = await res.json();
            const due: { id: string }[] = data?.data || [];

            if (due.length === 0) return;
            console.log(`[Cron] wa-status: ${due.length} schedule(s) due — posting now`);

            // Step 2: POST for each due schedule to trigger actual posting
            for (const schedule of due) {
                try {
                    const postRes = await fetch(`${appUrl}/api/wa-status/post`, {
                        method: 'POST',
                        headers: {
                            'x-cron-secret': cronSecret,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ schedule_id: schedule.id }),
                        signal: AbortSignal.timeout(30000),
                    });
                    const postData = await postRes.json();
                    if (postData.success) {
                        console.log(`[Cron] ✅ Posted schedule ${schedule.id}`);
                    } else {
                        console.error(`[Cron] ❌ Failed schedule ${schedule.id}:`, postData.error);
                    }
                } catch (err: any) {
                    console.error(`[Cron] Error posting schedule ${schedule.id}:`, err?.message);
                }
            }
        } catch (err: any) {
            if (err?.name !== 'TimeoutError') {
                console.error('[Cron] wa-status error:', err?.message);
            }
        }
    }, {
        timezone: 'Asia/Jakarta',
    });

    // ─── Broadcast Campaign Runner ─────────────────────────────────────────
    // Runs every minute, checks for pending broadcast campaigns
    cron.schedule('* * * * *', async () => {
        try {
            await fetch(`${appUrl}/api/campaigns/run`, {
                method: 'POST',
                headers: {
                    'x-cron-secret': cronSecret,
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(30000),
            });
        } catch { /* non-fatal */ }
    }, {
        timezone: 'Asia/Jakarta',
    });
}
