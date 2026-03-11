import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/admin/stats — Platform statistics (owner only)
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

        // Fetch stats in parallel
        const [tenantsRes, devicesRes, campaignsRes, contactsRes] = await Promise.all([
            supabase.from('tenants').select('*', { count: 'exact', head: true }),
            supabase.from('devices').select('*', { count: 'exact', head: true }),
            supabase.from('campaigns').select('*', { count: 'exact', head: true }),
            supabase.from('contacts').select('*', { count: 'exact', head: true }),
        ]);

        // Plan distribution
        const { data: tenants } = await supabase.from('tenants').select('plan');
        const planCounts: Record<string, number> = {};
        (tenants || []).forEach(t => {
            planCounts[t.plan] = (planCounts[t.plan] || 0) + 1;
        });

        // Connected devices
        const { count: connectedDevices } = await supabase
            .from('devices')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'connected');

        return NextResponse.json({
            success: true,
            data: {
                total_tenants: tenantsRes.count || 0,
                total_devices: devicesRes.count || 0,
                connected_devices: connectedDevices || 0,
                total_campaigns: campaignsRes.count || 0,
                total_contacts: contactsRes.count || 0,
                plan_distribution: planCounts,
            },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
