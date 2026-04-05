import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// PATCH /api/autoreply/[id]/knowledge/[fileId] — update knowledge file
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; fileId: string }> }
) {
    try {
        const { fileId } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { error } = await supabase
            .from('ai_knowledge_files')
            .update({ ...body, updated_at: new Date().toISOString() })
            .eq('id', fileId);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE /api/autoreply/[id]/knowledge/[fileId] — delete knowledge file
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; fileId: string }> }
) {
    try {
        const { fileId } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        await supabase.from('ai_knowledge_files').delete().eq('id', fileId);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
