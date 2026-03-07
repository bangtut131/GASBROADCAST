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
            const res = await fetch(`${appUrl}/api/wa-status/post`, {
                method: 'GET',
                headers: {
                    'x-cron-secret': cronSecret,
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(30000),
            });

            if (!res.ok) {
                const txt = await res.text();
                console.error('[Cron] wa-status/post error:', res.status, txt.slice(0, 100));
                return;
            }

            const data = await res.json();
            const due = data?.data || [];
            if (due.length > 0) {
                console.log(`[Cron] wa-status: ${due.length} schedule(s) triggered`);
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
