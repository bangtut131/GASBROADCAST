import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * POST /api/cron/cleanup-media
 * 
 * Auto-cleanup: Hapus file media inbox yang lebih dari 2 hari.
 * Dipanggil oleh cron scheduler (Railway/Vercel/external).
 * 
 * Also handles initial bucket setup if bucket doesn't exist yet.
 * 
 * Headers: x-cron-secret: <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
    try {
        // Auth: allow CRON_SECRET or authenticated admin/owner
        const cronSecret = request.headers.get('x-cron-secret');
        const hasCronAuth = cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET;

        if (!hasCronAuth) {
            const { createClient } = await import('@/lib/supabase/server');
            const userSupabase = await createClient();
            const { data: { user } } = await userSupabase.auth.getUser();
            if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

            const { data: profile } = await userSupabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();
            if (!profile || !['owner', 'admin'].includes(profile.role)) {
                return NextResponse.json({ error: 'Admin only' }, { status: 403 });
            }
        }

        const supabase = await createServiceClient();
        const results = { deleted: 0, errors: 0, bucketCreated: false };

        // === Step 1: Ensure bucket exists ===
        const { data: buckets } = await supabase.storage.listBuckets();
        const bucketExists = buckets?.some(b => b.id === 'inbox-media');

        if (!bucketExists) {
            const { error: createErr } = await supabase.storage.createBucket('inbox-media', {
                public: true,
                fileSizeLimit: 5 * 1024 * 1024, // 5MB
                allowedMimeTypes: [
                    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                    'video/mp4', 'video/3gpp',
                    'audio/mpeg', 'audio/ogg', 'audio/wav',
                    'application/pdf',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.ms-excel',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                ],
            });

            if (createErr) {
                console.error('[Cleanup] Bucket create error:', createErr.message);
            } else {
                results.bucketCreated = true;
                console.log('[Cleanup] ✅ Created inbox-media bucket');
            }
        }

        // === Step 2: Clean up files older than 2 days ===
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        // List all folders in inbox/
        const { data: userFolders } = await supabase.storage
            .from('inbox-media')
            .list('inbox', { limit: 1000 });

        if (userFolders && userFolders.length > 0) {
            for (const folder of userFolders) {
                // List files in each user folder
                const { data: files } = await supabase.storage
                    .from('inbox-media')
                    .list(`inbox/${folder.name}`, { limit: 1000 });

                if (!files || files.length === 0) continue;

                // Filter files older than 2 days
                const oldFiles = files.filter(file => {
                    if (!file.created_at) return false;
                    return new Date(file.created_at) < twoDaysAgo;
                });

                if (oldFiles.length === 0) continue;

                // Delete old files
                const filePaths = oldFiles.map(f => `inbox/${folder.name}/${f.name}`);
                const { error: delErr } = await supabase.storage
                    .from('inbox-media')
                    .remove(filePaths);

                if (delErr) {
                    console.error(`[Cleanup] Delete error for ${folder.name}:`, delErr.message);
                    results.errors += oldFiles.length;
                } else {
                    results.deleted += oldFiles.length;
                    console.log(`[Cleanup] ✅ Deleted ${oldFiles.length} files from inbox/${folder.name}`);
                }
            }
        }

        // === Step 3: Also null out media_url in messages older than 2 days ===
        // So the UI shows placeholder instead of broken image
        const { error: updateErr } = await supabase
            .from('messages')
            .update({ media_url: null })
            .not('media_url', 'is', null)
            .lt('created_at', twoDaysAgo.toISOString());

        if (updateErr) {
            console.error('[Cleanup] Messages update error:', updateErr.message);
        } else {
            console.log('[Cleanup] ✅ Cleared media_url from old messages');
        }

        return NextResponse.json({
            success: true,
            message: `Cleaned up ${results.deleted} files, ${results.errors} errors`,
            ...results,
            messagesCleared: true,
        });
    } catch (error: any) {
        console.error('[Cleanup] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * GET /api/cron/cleanup-media?action=setup
 * 
 * Quick setup: Buat bucket inbox-media jika belum ada.
 * Bisa dipanggil manual dari browser (perlu login admin).
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action');

        // Allow cron secret OR check for admin user
        const cronSecret = request.headers.get('x-cron-secret');
        const supabase = await createServiceClient();

        if (cronSecret !== process.env.CRON_SECRET) {
            // Check if called from authenticated admin
            const { createClient } = await import('@/lib/supabase/server');
            const userSupabase = await createClient();
            const { data: { user } } = await userSupabase.auth.getUser();
            if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

            const { data: profile } = await userSupabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();
            if (!profile || !['owner', 'admin'].includes(profile.role)) {
                return NextResponse.json({ error: 'Admin only' }, { status: 403 });
            }
        }

        // Create bucket
        const { data: buckets } = await supabase.storage.listBuckets();
        const exists = buckets?.some(b => b.id === 'inbox-media');

        if (exists) {
            return NextResponse.json({ success: true, message: 'Bucket inbox-media sudah ada', alreadyExists: true });
        }

        const { error } = await supabase.storage.createBucket('inbox-media', {
            public: true,
            fileSizeLimit: 5 * 1024 * 1024,
            allowedMimeTypes: [
                'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                'video/mp4', 'video/3gpp',
                'audio/mpeg', 'audio/ogg', 'audio/wav',
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ],
        });

        if (error) throw error;

        return NextResponse.json({ success: true, message: 'Bucket inbox-media berhasil dibuat! ✅', created: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
