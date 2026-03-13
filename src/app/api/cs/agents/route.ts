import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// GET /api/cs/agents — List CS agents (from team_members)
export async function GET(request: NextRequest) {
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

        // Try team_members table first, fallback to profiles
        const { data: members, error: membersError } = await supabase
            .from('team_members')
            .select('*')
            .eq('tenant_id', profile.tenant_id)
            .order('name');

        if (!membersError && members) {
            return NextResponse.json({ success: true, data: members });
        }

        // Fallback: read from profiles
        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, email, role, is_active')
            .eq('tenant_id', profile.tenant_id)
            .order('full_name');

        if (error) throw error;
        const agents = (data || []).map(p => ({
            id: p.id,
            name: p.full_name || p.email || 'Unknown',
            email: p.email || '',
            role: p.role || 'agent',
            is_active: p.is_active !== false,
            assigned_devices: [],
        }));
        return NextResponse.json({ success: true, data: agents });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/cs/agents — Add a new team member/agent
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

        const { name, email, role, assigned_devices } = await request.json();
        if (!name) return NextResponse.json({ error: 'Nama wajib diisi' }, { status: 400 });

        // --- Auto-Migration Logic for Existing Users ---
        if (email) {
            // Need service client to bypass RLS to search all profiles
            const serviceSupabase = await createServiceClient();
            
            // Check if user already exists in profiles
            const { data: existingProfile } = await serviceSupabase
                .from('profiles')
                .select('id, tenant_id')
                .eq('email', email)
                .single();

            if (existingProfile) {
                // User already registered! Take over their account.
                const oldTenantId = existingProfile.tenant_id;
                
                // 1. Move them to the new workspace and change role
                const { error: updateError } = await serviceSupabase
                    .from('profiles')
                    .update({ 
                        tenant_id: profile.tenant_id,
                        role: role || 'agent'
                    })
                    .eq('id', existingProfile.id);
                
                if (updateError) throw updateError;

                // 2. Clean up their old workspace (optional, but good for hygiene if they were the only user)
                if (oldTenantId !== profile.tenant_id) {
                    const { count } = await serviceSupabase
                        .from('profiles')
                        .select('*', { count: 'exact', head: true })
                        .eq('tenant_id', oldTenantId);
                    
                    if (count === 0) {
                        // Safe to delete the old empty tenant
                        await serviceSupabase.from('tenants').delete().eq('id', oldTenantId);
                    }
                }
            }
        }
        // ----------------------------------------------

        const { data, error } = await supabase
            .from('team_members')
            .insert({
                tenant_id: profile.tenant_id,
                name,
                email: email || null,
                role: role || 'agent',
                is_active: true,
                assigned_devices: assigned_devices || [],
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH /api/cs/agents — Toggle active status
export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { id, is_active, assigned_devices } = await request.json();
        
        let updates: any = {};
        if (is_active !== undefined) updates.is_active = is_active;
        if (assigned_devices !== undefined) updates.assigned_devices = assigned_devices;

        const { error } = await supabase
            .from('team_members')
            .update(updates)
            .eq('id', id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE /api/cs/agents — Remove a team member
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { id } = await request.json();
        const { error } = await supabase
            .from('team_members')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
