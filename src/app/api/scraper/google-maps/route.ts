import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { scrapeGoogleMaps } from '@/lib/scraper/google-maps';

// Extend timeout to 5 minutes for scraping (Vercel only)
export const maxDuration = 300;

// Timeout wrapper — ensures the request always returns within a time limit
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Timeout: ${label} melebihi ${Math.round(ms / 1000)} detik. Coba lagi dengan jumlah hasil lebih sedikit.`));
        }, ms);

        promise
            .then(result => { clearTimeout(timer); resolve(result); })
            .catch(err => { clearTimeout(timer); reject(err); });
    });
}

// POST /api/scraper/google-maps — Run scraper in background
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Only owner/admin can use scraper
        const { data: profile } = await supabase
            .from('profiles')
            .select('role, tenant_id')
            .eq('id', user.id)
            .single();
            
        if (!profile || !['owner', 'admin'].includes(profile.role)) {
            return NextResponse.json({ error: 'Forbidden — hanya owner/admin' }, { status: 403 });
        }

        const { query, maxResults = 40 } = await request.json();
        if (!query || typeof query !== 'string' || query.trim().length < 3) {
            return NextResponse.json({ error: 'Query minimal 3 karakter' }, { status: 400 });
        }

        // Limit max results to prevent abuse
        const safeMax = Math.min(Math.max(maxResults, 5), 120);

        // 1. Create a background job record
        const { data: job, error: jobError } = await supabase
            .from('scraper_jobs')
            .insert({
                tenant_id: profile.tenant_id,
                user_id: user.id,
                query: query.trim(),
                max_results: safeMax,
                status: 'processing'
            })
            .select('id')
            .single();

        if (jobError) {
            console.error('[Scraper] Failed to create job:', jobError);
            return NextResponse.json({ error: 'Gagal membuat antrean scraping' }, { status: 500 });
        }

        const jobId = job.id;
        console.log(`[Scraper] Job ${jobId} started: "${query.trim()}" max=${safeMax}`);

        // 2. Fire and Forget the Scraping Process
        // This runs asynchronously in the background. Vercel Serverless might kill this,
        // but it works fine on standard Node.js environments like Railway.
        (async () => {
            try {
                // We recreate the supabase client internally stringently for the background thread
                // if needed, but we can also use the service role key or just the auth user's client 
                // However, Next.js server actions / routes recommend a fresh client for background.
                const { createClient } = await import('@supabase/supabase-js');
                const supabaseAdmin = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.SUPABASE_SERVICE_ROLE_KEY!
                );

                const { results, error } = await withTimeout(
                    scrapeGoogleMaps(query.trim(), safeMax),
                    400_000, // Background timeout (nearly 7 mins)
                    'Proses scraping'
                );

                if (error) {
                    await supabaseAdmin.from('scraper_jobs').update({
                        status: 'failed',
                        error_message: error,
                        completed_at: new Date().toISOString()
                    }).eq('id', jobId);
                    
                    // Create failure notification
                    await supabaseAdmin.from('notifications').insert({
                        tenant_id: profile.tenant_id,
                        user_id: user.id,
                        title: 'Scraping Gagal',
                        message: `Gagal mencari "${query.trim()}": ${error}`,
                        type: 'system',
                        is_read: false
                    });
                    
                    console.log(`[Scraper] Job ${jobId} failed: ${error}`);
                    return;
                }

                // Success
                await supabaseAdmin.from('scraper_jobs').update({
                    status: 'completed',
                    results: results,
                    count_found: results.length,
                    completed_at: new Date().toISOString()
                }).eq('id', jobId);

                // Create success notification
                await supabaseAdmin.from('notifications').insert({
                    tenant_id: profile.tenant_id,
                    user_id: user.id,
                    title: 'Scraping Google Maps Selesai',
                    message: `Berhasil mendapatkan ${results.length} kontak untuk pencarian "${query.trim()}".`,
                    type: 'system',
                    is_read: false,
                    metadata: { type: 'scraper_completed', job_id: jobId }
                });
                
                console.log(`[Scraper] Job ${jobId} completed: ${results.length} results`);

            } catch (err: any) {
                console.error(`[Scraper] Unhandled Background Error for Job ${jobId}:`, err);
                const { createClient } = await import('@supabase/supabase-js');
                const supabaseAdmin = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.SUPABASE_SERVICE_ROLE_KEY!
                );
                await supabaseAdmin.from('scraper_jobs').update({
                    status: 'failed',
                    error_message: err.message || 'Unknown background error',
                    completed_at: new Date().toISOString()
                }).eq('id', jobId);
            }
        })();

        // 3. Immediately respond to the client
        return NextResponse.json({
            success: true,
            jobId,
            message: 'Proses scraping sedang berjalan di latar belakang.'
        });

    } catch (error: any) {
        console.error(`[Scraper] Error:`, error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
