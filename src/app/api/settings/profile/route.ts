import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        let tenant = null;
        if (profile?.tenant_id) {
            const { data } = await supabase
                .from('tenants')
                .select('id, name, plan, settings, webhook_token')
                .eq('id', profile.tenant_id)
                .single();
            tenant = data;
        }

        return NextResponse.json({ success: true, data: { ...profile, tenant, email: user.email } });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { full_name, timezone, language } = await request.json();

        const { error } = await supabase
            .from('profiles')
            .update({ full_name, timezone, language })
            .eq('id', user.id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
