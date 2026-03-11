import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/admin/tenants — List all tenants with usage stats
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();
        if (!profile || profile.role !== 'owner') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Fetch all tenants
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Get device counts per tenant
        const { data: deviceCounts } = await supabase
            .from('devices')
            .select('tenant_id');

        // Get user/profile info per tenant
        const { data: profiles } = await supabase
            .from('profiles')
            .select('tenant_id, full_name, role');

        // Enrich tenants
        const enriched = (tenants || []).map(t => {
            const devCount = (deviceCounts || []).filter(d => d.tenant_id === t.id).length;
            const tenantProfiles = (profiles || []).filter(p => p.tenant_id === t.id);
            const ownerProfile = tenantProfiles.find(p => p.role === 'owner' || p.role === 'admin');
            return {
                ...t,
                device_count: devCount,
                member_count: tenantProfiles.length,
                owner_name: ownerProfile?.full_name || '-',
            };
        });

        return NextResponse.json({ success: true, data: enriched });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH /api/admin/tenants — Update tenant plan
export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();
        if (!profile || profile.role !== 'owner') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { tenant_id, plan } = await request.json();
        if (!tenant_id || !plan) {
            return NextResponse.json({ error: 'tenant_id and plan required' }, { status: 400 });
        }

        const validPlans = ['free', 'starter', 'pro', 'enterprise'];
        if (!validPlans.includes(plan)) {
            return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
        }

        const { error } = await supabase
            .from('tenants')
            .update({ plan })
            .eq('id', tenant_id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
