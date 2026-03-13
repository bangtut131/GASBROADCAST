import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PLAN_LIMITS, hasReachedLimit, PlanType } from '@/lib/planLimits';

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

        // Enforce Plan Limits
        const { data: tenant } = await supabase
            .from('tenants')
            .select('plan')
            .eq('id', profile.tenant_id)
            .single();
            
        const plan = (tenant?.plan || 'free') as PlanType;
        const limit = PLAN_LIMITS[plan].broadcasts;

        if (limit !== -1) {
            const { count } = await supabase
                .from('campaigns')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', profile.tenant_id);

            if (hasReachedLimit(count || 0, limit)) {
                return NextResponse.json({ 
                    error: `Paket ${plan} maksimal dapat membuat ${limit} broadcast campaign. Silakan upgrade paket Anda.` 
                }, { status: 403 });
            }
        }

        const body = await request.json();
        const {
            name, device_id, message_template, target_type, target_group_id,
            target_phones, media_type, media_url, min_delay, max_delay,
            scheduled_at, auto_start, greetings,
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
                greetings: greetings || null,
                created_by: user.id,
            })
            .select()
            .single();

        if (error) throw error;

        // If auto_start, create pending message records
        // Note: actual sending is triggered client-side via /api/campaigns/[id]/run
        if (auto_start && !scheduled_at) {
            await startBroadcast(supabase, campaign, profile.tenant_id);
        }

        return NextResponse.json({ success: true, data: campaign });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function startBroadcast(supabase: any, campaign: any, tenantId: string) {
    try {
        let targets: { phone: string; contact_id?: string }[] = [];

        if (campaign.target_type === 'group' && campaign.target_group_id) {
            const { data: members } = await supabase
                .from('contact_group_members')
                .select('contact:contacts(id, phone)')
                .eq('group_id', campaign.target_group_id);
            targets = (members || [])
                .map((m: any) => ({ phone: m.contact?.phone, contact_id: m.contact?.id }))
                .filter((t: any) => t.phone);
        } else if (campaign.target_type === 'manual' && campaign.target_phones) {
            // Find existing contacts to link contact_id for {name} parsing
            const { data: existingContacts } = await supabase
                .from('contacts')
                .select('id, phone')
                .eq('tenant_id', tenantId)
                .in('phone', campaign.target_phones);
            
            targets = campaign.target_phones.map((p: string) => {
                const match = existingContacts?.find((c: any) => c.phone === p);
                return { phone: p, contact_id: match?.id };
            });
        }

        if (targets.length === 0) return;

        // Skip blacklisted phones
        const phonesToCheck = targets.map((t: any) => t.phone);
        const { data: blacklisted } = await supabase
            .from('blacklisted_contacts')
            .select('phone')
            .eq('tenant_id', tenantId)
            .in('phone', phonesToCheck);
            
        const blacklistedPhones = new Set((blacklisted || []).map((b: any) => b.phone));

        // Create broadcast_messages records (pending / failed for blacklisted)
        let messages = [];
        for (const t of targets) {
            const isBlacklisted = blacklistedPhones.has(t.phone);
            messages.push({
                campaign_id: campaign.id,
                contact_id: t.contact_id || null,
                phone: t.phone,
                status: isBlacklisted ? 'failed' : 'pending',
                error_message: isBlacklisted ? 'BLACKLISTED' : null
            });
        }

        if (messages.length === 0) return;

        await supabase.from('broadcast_messages').insert(messages);

        // Calculate actual failed vs total
        const initialFailed = messages.filter(m => m.status === 'failed').length;

        // Update total_recipients in campaigns
        await supabase
            .from('campaigns')
            .update({ 
                total_recipients: targets.length, 
                failed_count: initialFailed,
                status: initialFailed === targets.length ? 'completed' : 'running'
            })
            .eq('id', campaign.id);
    } catch (err) {
        console.error('startBroadcast error:', err);
    }
}
