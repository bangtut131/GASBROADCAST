import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { isSuperAdmin } from '@/lib/admin';

// GET /api/admin/roles — List all custom roles
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        if (!isSuperAdmin(user.email ?? undefined)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const serviceSupabase = await createServiceClient();
        const { data, error } = await serviceSupabase
            .from('custom_roles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/admin/roles — Create a new custom role
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        if (!isSuperAdmin(user.email ?? undefined)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { name, description, permissions } = await request.json();
        if (!name) return NextResponse.json({ error: 'Nama role wajib diisi' }, { status: 400 });

        const serviceSupabase = await createServiceClient();
        const { data, error } = await serviceSupabase
            .from('custom_roles')
            .insert({ name, description, permissions: permissions || {} })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') { // Unique violation
                return NextResponse.json({ error: 'Nama role sudah ada' }, { status: 400 });
            }
            throw error;
        }
        
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE /api/admin/roles — Delete a custom role
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        if (!isSuperAdmin(user.email ?? undefined)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: 'Role ID required' }, { status: 400 });

        const serviceSupabase = await createServiceClient();
        const { error } = await serviceSupabase
            .from('custom_roles')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
