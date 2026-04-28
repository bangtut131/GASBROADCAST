import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * POST /api/cron/cleanup-media
 * 
 * AGGRESSIVE Auto-cleanup to stay within Supabase free tier (1GB storage):
 * 
 * 1. inbox-media bucket: Hapus file > 6 jam (was 2 days)
 * 2. wa-status bucket:   Hapus file > 24 jam (NEW — was never cleaned!)
 * 3. messages table:     Null out media_url on old messages
 * 
 * Dipanggil oleh cron scheduler (Railway/Vercel/external).
 * Rekomendasi: jalankan setiap 1-2 jam.
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
        const results = {
            inboxDeleted: 0,
            statusDeleted: 0,
            errors: 0,
            bucketCreated: false,
            messagesCleared: 0,
        };

        // === Step 1: Ensure inbox-media bucket exists ===
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

        // === Step 2: Clean up inbox-media files older than 6 HOURS ===
        const sixHoursAgo = new Date();
        sixHoursAgo.setHours(sixHoursAgo.getHours() - 6);

        results.inboxDeleted = await cleanupBucket(supabase, 'inbox-media', 'inbox', sixHoursAgo);

        // === Step 3: Clean up wa-status files older than 24 HOURS ===
        // wa-status files are only needed for broadcasting, once posted they can be deleted
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);

        results.statusDeleted = await cleanupBucket(supabase, 'wa-status', '', oneDayAgo);

        // === Step 4: Null out media_url in old messages ===
        // Use the same 6-hour window so UI shows placeholder instead of broken image
        const { data: updatedMessages, error: updateErr } = await supabase
            .from('messages')
            .update({ media_url: null })
            .not('media_url', 'is', null)
            .lt('created_at', sixHoursAgo.toISOString())
            .select('id');

        if (updateErr) {
            console.error('[Cleanup] Messages update error:', updateErr.message);
        } else {
            results.messagesCleared = updatedMessages?.length || 0;
            console.log(`[Cleanup] ✅ Cleared media_url from ${results.messagesCleared} old messages`);
        }

        const totalDeleted = results.inboxDeleted + results.statusDeleted;
        console.log(`[Cleanup] ✅ DONE — inbox: ${results.inboxDeleted}, wa-status: ${results.statusDeleted}, messages: ${results.messagesCleared}`);

        return NextResponse.json({
            success: true,
            message: `Cleaned ${totalDeleted} files (inbox: ${results.inboxDeleted}, wa-status: ${results.statusDeleted}), messages cleared: ${results.messagesCleared}`,
            ...results,
        });
    } catch (error: any) {
        console.error('[Cleanup] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * Generic bucket cleanup: recursively list and delete files older than cutoff date.
 * Handles nested folder structures (e.g., inbox/user_id/file.jpg or tenant_id/file.jpg).
 */
async function cleanupBucket(
    supabase: any,
    bucketName: string,
    rootPrefix: string,
    cutoffDate: Date
): Promise<number> {
    let totalDeleted = 0;

    try {
        // List root-level items (could be folders or files)
        const listPath = rootPrefix || '';
        const { data: items, error: listErr } = await supabase.storage
            .from(bucketName)
            .list(listPath, { limit: 1000 });

        if (listErr) {
            console.error(`[Cleanup] List error for ${bucketName}/${listPath}:`, listErr.message);
            return 0;
        }

        if (!items || items.length === 0) return 0;

        // Separate files and folders
        const files = items.filter((item: any) => item.id); // Files have an id
        const folders = items.filter((item: any) => !item.id); // Folders don't have an id

        // Delete old files at this level
        if (files.length > 0) {
            const oldFiles = files.filter((file: any) => {
                if (!file.created_at) return false;
                return new Date(file.created_at) < cutoffDate;
            });

            if (oldFiles.length > 0) {
                const filePaths = oldFiles.map((f: any) =>
                    listPath ? `${listPath}/${f.name}` : f.name
                );

                // Delete in batches of 100
                for (let i = 0; i < filePaths.length; i += 100) {
                    const batch = filePaths.slice(i, i + 100);
                    const { error: delErr } = await supabase.storage
                        .from(bucketName)
                        .remove(batch);

                    if (delErr) {
                        console.error(`[Cleanup] Delete error in ${bucketName}/${listPath}:`, delErr.message);
                    } else {
                        totalDeleted += batch.length;
                        console.log(`[Cleanup] ✅ Deleted ${batch.length} files from ${bucketName}/${listPath || '(root)'}`);
                    }
                }
            }
        }

        // Recurse into folders
        for (const folder of folders) {
            const folderPath = listPath ? `${listPath}/${folder.name}` : folder.name;
            const { data: subFiles } = await supabase.storage
                .from(bucketName)
                .list(folderPath, { limit: 1000 });

            if (!subFiles || subFiles.length === 0) continue;

            const oldSubFiles = subFiles.filter((file: any) => {
                if (!file.created_at) return false;
                return new Date(file.created_at) < cutoffDate;
            });

            if (oldSubFiles.length === 0) continue;

            const subPaths = oldSubFiles.map((f: any) => `${folderPath}/${f.name}`);

            for (let i = 0; i < subPaths.length; i += 100) {
                const batch = subPaths.slice(i, i + 100);
                const { error: delErr } = await supabase.storage
                    .from(bucketName)
                    .remove(batch);

                if (delErr) {
                    console.error(`[Cleanup] Delete error in ${bucketName}/${folderPath}:`, delErr.message);
                } else {
                    totalDeleted += batch.length;
                    console.log(`[Cleanup] ✅ Deleted ${batch.length} files from ${bucketName}/${folderPath}`);
                }
            }
        }
    } catch (err: any) {
        console.error(`[Cleanup] Exception in ${bucketName}:`, err.message);
    }

    return totalDeleted;
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

        // If action=purge, do an immediate aggressive cleanup (delete ALL files)
        if (action === 'purge') {
            let totalPurged = 0;
            const epoch = new Date(); // cutoff = now = delete everything

            totalPurged += await cleanupBucket(supabase, 'inbox-media', 'inbox', epoch);
            totalPurged += await cleanupBucket(supabase, 'wa-status', '', epoch);

            // Also clear media_url from all messages
            const { data: clearedMsgs } = await supabase
                .from('messages')
                .update({ media_url: null })
                .not('media_url', 'is', null)
                .select('id');

            return NextResponse.json({
                success: true,
                message: `🗑️ PURGED ${totalPurged} files, cleared ${clearedMsgs?.length || 0} message media URLs`,
                filesPurged: totalPurged,
                messagesPurged: clearedMsgs?.length || 0,
            });
        }

        // Default: Create bucket
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
