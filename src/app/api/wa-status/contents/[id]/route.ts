import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// DELETE /api/wa-status/contents/[id]
// Also deletes the file from Supabase Storage if it was uploaded there
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Get content to check if file is in Supabase Storage
        const { data: content } = await supabase
            .from('status_contents')
            .select('content_url, storage_path')
            .eq('id', id)
            .single();

        // Hard delete from database
        const { error } = await supabase.from('status_contents').delete().eq('id', id);
        if (error) throw error;

        // If file was uploaded to Supabase Storage, delete it too
        const storagePath = content?.storage_path ||
            (content?.content_url?.includes('/storage/v1/object/public/wa-status/')
                ? content.content_url.split('/storage/v1/object/public/wa-status/')[1]
                : null);

        if (storagePath) {
            try {
                await supabase.storage.from('wa-status').remove([storagePath]);
            } catch (storageErr) {
                console.warn('[DeleteContent] Storage delete failed (non-fatal):', storageErr);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
