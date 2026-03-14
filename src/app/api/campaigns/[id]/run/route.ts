import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { processMessagesInBackground } from '@/lib/campaign-runner';

// POST /api/campaigns/[id]/run — Execute broadcast for a campaign
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Get campaign with device
        const { data: campaign } = await supabase
            .from('campaigns')
            .select('*, device:devices(*)')
            .eq('id', id)
            .single();

        if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

        const device = campaign.device;
        if (!device || device.status !== 'connected') {
            return NextResponse.json({ error: 'Device not connected' }, { status: 400 });
        }

        // Process ALL pending messages in background
        processMessagesInBackground({
            id,
            device,
            campaign,
            supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY! // need service key for background
        }).catch(err => console.error('Background broadcast failed:', err));

        return NextResponse.json({
            success: true,
            message: 'Broadcast started in background',
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
