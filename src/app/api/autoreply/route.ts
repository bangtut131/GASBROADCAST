import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/autoreply — list auto-reply rules
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data, error } = await supabase
            .from('autoreply_rules')
            .select('id, name, trigger_type, trigger_value, response_text, is_active, priority, device_id, ai_model, ai_base_url, ai_system_prompt, target_tags, target_group_ids, exclude_tags, exclude_phones, created_at')
            .order('priority', { ascending: false });

        if (error) throw error;
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/autoreply — create rule
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
            name, device_id, trigger_type, trigger_value, response_text,
            is_active, priority,
            // AI fields
            ai_base_url, ai_api_key, ai_model, ai_system_prompt,
            ai_temperature, ai_max_tokens, ai_context_turns,
            // Advanced filters
            target_tags, target_group_ids, exclude_tags, exclude_phones,
        } = body;

        if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
        if (trigger_type !== 'ai' && !response_text) {
            return NextResponse.json({ error: 'response_text required for non-AI triggers' }, { status: 400 });
        }
        if (trigger_type === 'ai' && (!ai_base_url || !ai_api_key || !ai_model)) {
            return NextResponse.json({ error: 'ai_base_url, ai_api_key, ai_model required for AI trigger' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('autoreply_rules')
            .insert({
                tenant_id: profile.tenant_id,
                device_id: device_id || null,
                name,
                trigger_type: trigger_type || 'keyword',
                trigger_value: trigger_value || null,
                response_text: response_text || '',
                is_active: is_active !== false,
                priority: priority || 0,
                ai_base_url: ai_base_url || null,
                ai_api_key: ai_api_key || null,
                ai_model: ai_model || null,
                ai_system_prompt: ai_system_prompt || null,
                ai_temperature: ai_temperature ?? 0.7,
                ai_max_tokens: ai_max_tokens ?? 512,
                ai_context_turns: ai_context_turns ?? 5,
                // Advanced filters
                target_tags: target_tags || [],
                target_group_ids: target_group_ids || [],
                exclude_tags: exclude_tags || [],
                exclude_phones: exclude_phones || [],
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

