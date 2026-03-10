import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/campaigns — list campaigns
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data, error } = await supabase
            .from('campaigns')
            .select('*, device:devices(name, phone_number, status)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/campaigns — create a campaign
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase
            .from('profiles')
            .select('tenant_id')
            .eq('id', user.id)
            .single();
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

        const body = await request.json();
        const {
            name, device_id, message_template, target_type, target_group_id,
            target_phones, media_type, media_url, min_delay, max_delay,
            scheduled_at, auto_start,
        } = body;

        // Count recipients
        let total_recipients = 0;
        if (target_type === 'group' && target_group_id) {
            const { count } = await supabase
                .from('contact_group_members')
                .select('*', { count: 'exact', head: true })
                .eq('group_id', target_group_id);
            total_recipients = count || 0;
        } else if (target_type === 'manual' && target_phones) {
            total_recipients = target_phones.length;
        }

        const { data: campaign, error } = await supabase
            .from('campaigns')
            .insert({
                tenant_id: profile.tenant_id,
                device_id,
                name,
                message_template,
                target_type,
                target_group_id: target_group_id || null,
                target_phones: target_phones || null,
                media_type: media_type || null,
                media_url: media_url || null,
                min_delay: min_delay || 3,
                max_delay: max_delay || 8,
                scheduled_at: scheduled_at || null,
                status: scheduled_at ? 'scheduled' : auto_start ? 'running' : 'draft',
                total_recipients,
                created_by: user.id,
            })
            .select()
            .single();

        if (error) throw error;

        // If auto_start, trigger the broadcast queue
        if (auto_start && !scheduled_at) {
            // Create pending message records
            await startBroadcast(supabase, campaign, profile.tenant_id);

            // Fire-and-forget: trigger the actual broadcast runner
            // Forward cookies so the /run endpoint can authenticate
            const baseUrl = request.nextUrl.origin;
            const cookieHeader = request.headers.get('cookie') || '';
            fetch(`${baseUrl}/api/campaigns/${campaign.id}/run`, {
                method: 'POST',
                headers: { 'Cookie': cookieHeader },
            }).catch(err => console.error('[Broadcast] Run trigger failed:', err.message));
        }

        return NextResponse.json({ success: true, data: campaign });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function startBroadcast(supabase: any, campaign: any, tenantId: string) {
    try {
        let phones: string[] = [];

        if (campaign.target_type === 'group' && campaign.target_group_id) {
            const { data: members } = await supabase
                .from('contact_group_members')
                .select('contact:contacts(phone, name)')
                .eq('group_id', campaign.target_group_id);
            phones = (members || []).map((m: any) => m.contact?.phone).filter(Boolean);
        } else if (campaign.target_type === 'manual' && campaign.target_phones) {
            phones = campaign.target_phones;
        }

        if (phones.length === 0) return;

        // Create broadcast_messages records (pending)
        const messages = phones.map(phone => ({
            campaign_id: campaign.id,
            phone,
            status: 'pending',
        }));

        await supabase.from('broadcast_messages').insert(messages);

        // Update total_recipients
        await supabase
            .from('campaigns')
            .update({ total_recipients: phones.length, status: 'running' })
            .eq('id', campaign.id);
    } catch (err) {
        console.error('startBroadcast error:', err);
    }
}
