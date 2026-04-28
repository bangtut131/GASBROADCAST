import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/3gpp',
    'audio/mpeg', 'audio/ogg', 'audio/wav',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

// POST /api/inbox/upload — Upload file to Supabase Storage
export async function POST(request: NextRequest) {
    try {
        // Auth check with user client
        const userSupabase = await createClient();
        const { data: { user } } = await userSupabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: `File terlalu besar. Maksimal ${MAX_FILE_SIZE / 1024 / 1024}MB` }, { status: 400 });
        }

        // Validate MIME type
        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json({ error: `Tipe file tidak didukung: ${file.type}` }, { status: 400 });
        }

        // Determine media type
        let mediaType = 'document';
        if (file.type.startsWith('image/')) mediaType = 'image';
        else if (file.type.startsWith('video/')) mediaType = 'video';
        else if (file.type.startsWith('audio/')) mediaType = 'audio';

        // Generate unique filename
        const ext = file.name.split('.').pop() || 'bin';
        const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
        const filePath = `inbox/${user.id}/${filename}`;

        // Upload to Supabase Storage (use service client to bypass RLS)
        // Compress images before upload to save storage
        const supabase = await createServiceClient();
        let buffer = Buffer.from(await file.arrayBuffer());
        let uploadMimeType = file.type;

        if (file.type.startsWith('image/')) {
            try {
                const { compressImageBuffer } = await import('@/lib/image-compress');
                const compressed = await compressImageBuffer(buffer, file.type, { maxSizeKB: 300 });
                buffer = Buffer.from(compressed.buffer);
                uploadMimeType = compressed.mimeType;
            } catch (compressErr: any) {
                console.warn('[Upload] Image compression skipped:', compressErr.message);
            }
        }

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('inbox-media')
            .upload(filePath, buffer, {
                contentType: uploadMimeType,
                upsert: false,
            });

        if (uploadError) {
            console.error('[Upload] Supabase Storage error:', uploadError.message);
            return NextResponse.json({ error: 'Upload gagal: ' + uploadError.message }, { status: 500 });
        }

        // Get public URL
        const { data: publicUrlData } = supabase.storage
            .from('inbox-media')
            .getPublicUrl(filePath);

        return NextResponse.json({
            success: true,
            data: {
                url: publicUrlData.publicUrl,
                path: filePath,
                mediaType,
                filename: file.name,
                size: file.size,
            },
        });
    } catch (error: any) {
        console.error('[Upload] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
