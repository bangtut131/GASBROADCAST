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

// POST /api/scraper/google-maps — Run scraper
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Only owner/admin can use scraper
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
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

        console.log(`[Scraper] Starting scrape: "${query.trim()}" max=${safeMax}`);

        // Wrap scraper with 300-second timeout to prevent infinite loading
        const { results, error } = await withTimeout(
            scrapeGoogleMaps(query.trim(), safeMax),
            300_000,
            'Proses scraping'
        );

        console.log(`[Scraper] Completed: ${results.length} results, error=${error || 'none'}`);

        if (error) {
            return NextResponse.json({ success: false, error, data: results }, { status: 200 });
        }

        return NextResponse.json({
            success: true,
            data: results,
            meta: { query: query.trim(), totalFound: results.length },
        });
    } catch (error: any) {
        console.error(`[Scraper] Error:`, error.message);
        // Return 200 with success: false so the frontend can show the error gracefully
        return NextResponse.json({ success: false, error: error.message, data: [] }, { status: 200 });
    }
}
