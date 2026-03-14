import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { startBroadcast, processMessagesInBackground } from '@/lib/campaign-runner';

// POST /api/campaigns/run — Global cron runner for scheduled campaigns
export async function POST(request: NextRequest) {
    const cronSecret = request.headers.get('x-cron-secret');
    if (cronSecret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const bgSupabase = createClient(supabaseUrl, supabaseKey);

    try {
        // Find due campaigns
        const { data: dueCampaigns } = await bgSupabase
            .from('campaigns')
            .select('*, device:devices(*)')
            .eq('status', 'scheduled')
            .lte('scheduled_at', new Date().toISOString());

        if (!dueCampaigns || dueCampaigns.length === 0) {
            return NextResponse.json({ success: true, message: 'No scheduled campaigns due.' });
        }

        console.log(`[Cron] Found ${dueCampaigns.length} scheduled campaign(s) due.`);

        const started = [];
        for (const campaign of dueCampaigns) {
            try {
                const device = campaign.device;
                
                // Set to running to avoid duplicate triggers
                await bgSupabase.from('campaigns').update({ status: 'running' }).eq('id', campaign.id);

                if (!device || device.status !== 'connected') {
                    console.error(`[Cron] Skipping campaign ${campaign.id}: device disconnected.`);
                    await bgSupabase.from('campaigns').update({ status: 'failed', failed_count: -1 }).eq('id', campaign.id);
                    continue;
                }

                // 1. Generate pending targets (this was skipped during creation because of scheduled_at)
                await startBroadcast(bgSupabase, campaign, campaign.tenant_id);

                // 2. Process in background
                processMessagesInBackground({
                    id: campaign.id,
                    device,
                    campaign,
                    supabaseKey
                }).catch(err => console.error(`[Cron] BG fail for campaign ${campaign.id}:`, err));

                started.push(campaign.id);
            } catch (err: any) {
                console.error(`[Cron] Failed to start campaign ${campaign.id}:`, err?.message);
                await bgSupabase.from('campaigns').update({ status: 'failed' }).eq('id', campaign.id);
            }
        }

        return NextResponse.json({ success: true, count: started.length, started });
    } catch (err: any) {
        console.error('[Cron] Error scanning campaigns:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
