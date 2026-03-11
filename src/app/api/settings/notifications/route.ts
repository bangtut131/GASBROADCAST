import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// PATCH /api/settings/notifications — Save notification preferences to tenant.settings
export async function PATCH(request: NextRequest) {
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

        const { notifications } = await request.json();

        // Merge notifications into existing tenant settings
        const { data: tenant } = await supabase
            .from('tenants')
            .select('settings')
            .eq('id', profile.tenant_id)
            .single();

        const currentSettings = (tenant?.settings as Record<string, unknown>) || {};
        const updatedSettings = { ...currentSettings, notifications };

        const { error } = await supabase
            .from('tenants')
            .update({ settings: updatedSettings })
            .eq('id', profile.tenant_id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
