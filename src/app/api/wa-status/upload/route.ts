import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/wa-status/upload — Upload file to Supabase Storage wa-status bucket
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

        // Validate type
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime'];
        if (!allowed.includes(file.type)) {
            return NextResponse.json({ error: `Tipe file tidak didukung: ${file.type}` }, { status: 400 });
        }

        // Validate size (10MB)
        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: 'Ukuran file maksimal 10MB' }, { status: 400 });
        }

        // Build storage path: tenant_id/timestamp-filename
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${profile.tenant_id}/${Date.now()}-${safeName}`;

        // Convert File to ArrayBuffer for upload
        const buffer = await file.arrayBuffer();

        const { error: uploadError } = await supabase.storage
            .from('wa-status')
            .upload(storagePath, buffer, {
                contentType: file.type,
                upsert: false,
            });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('wa-status')
            .getPublicUrl(storagePath);

        const fileType = file.type.startsWith('video/') ? 'video' : 'image';

        return NextResponse.json({
            success: true,
            data: {
                url: publicUrl,
                path: storagePath,
                type: fileType,
                name: file.name,
                size: file.size,
            },
        });
    } catch (error: any) {
        console.error('[Upload] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE /api/wa-status/upload — Delete file from Supabase Storage
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { path } = await request.json();
        if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 });

        const { error } = await supabase.storage.from('wa-status').remove([path]);
        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
