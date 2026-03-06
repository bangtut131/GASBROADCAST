import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey, hasPermission } from '@/lib/api-auth';

// GET /api/v1/contacts — List contacts via Public REST API
export async function GET(request: NextRequest) {
    const auth = await verifyApiKey(request);
    if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    if (!hasPermission(auth, 'read_contacts')) {
        return NextResponse.json({ error: 'Permission denied: read_contacts required' }, { status: 403 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
        const limit = Math.min(200, parseInt(searchParams.get('limit') || '50'));
        const search = searchParams.get('search') || '';

        const { supabase, tenantId } = auth;
        let query = supabase
            .from('contacts')
            .select('id, phone, name, email, tags, created_at', { count: 'exact' })
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);

        if (search) {
            query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
        }

        const { data, count, error } = await query;
        if (error) throw error;

        return NextResponse.json({
            success: true,
            data,
            meta: { total: count || 0, page, limit, total_pages: Math.ceil((count || 0) / limit) },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/v1/contacts — Create/upsert contact via Public REST API
export async function POST(request: NextRequest) {
    const auth = await verifyApiKey(request);
    if ('error' in auth) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    try {
        const { phone, name, email, tags } = await request.json();
        if (!phone) return NextResponse.json({ error: 'phone is required' }, { status: 400 });

        const { supabase, tenantId } = auth;
        let normalizedPhone = phone.replace(/\D/g, '');
        if (normalizedPhone.startsWith('08')) normalizedPhone = '62' + normalizedPhone.slice(1);

        const { data, error } = await supabase
            .from('contacts')
            .upsert(
                { tenant_id: tenantId, phone: normalizedPhone, name, email, tags: tags || [] },
                { onConflict: 'tenant_id,phone' }
            )
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
