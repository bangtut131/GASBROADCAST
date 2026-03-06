import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/contacts — List contacts with pagination & search
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const search = searchParams.get('search') || '';
        const groupId = searchParams.get('group_id') || '';

        let query = supabase
            .from('contacts')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);

        if (search) {
            query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
        }

        if (groupId) {
            const { data: memberIds } = await supabase
                .from('contact_group_members')
                .select('contact_id')
                .eq('group_id', groupId);
            const ids = (memberIds || []).map(m => m.contact_id);
            query = query.in('id', ids);
        }

        const { data, count, error } = await query;
        if (error) throw error;

        return NextResponse.json({
            success: true,
            data,
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit),
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/contacts — Create single contact
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
        const { phone, name, email, tags, metadata } = body;

        if (!phone) return NextResponse.json({ error: 'phone is required' }, { status: 400 });

        // Normalize phone
        let normalizedPhone = phone.replace(/\D/g, '');
        if (normalizedPhone.startsWith('08')) normalizedPhone = '62' + normalizedPhone.slice(1);
        if (normalizedPhone.startsWith('0')) normalizedPhone = '62' + normalizedPhone.slice(1);

        const { data: contact, error } = await supabase
            .from('contacts')
            .upsert({
                tenant_id: profile.tenant_id,
                phone: normalizedPhone,
                name: name || null,
                email: email || null,
                tags: tags || [],
                metadata: metadata || {},
            }, { onConflict: 'tenant_id,phone' })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data: contact });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
