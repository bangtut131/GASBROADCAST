import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { scrapeGoogleMaps } from '@/lib/scraper/google-maps';

// Extend timeout to 5 minutes for scraping
export const maxDuration = 300;

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

        const { results, error } = await scrapeGoogleMaps(query.trim(), safeMax);

        if (error) {
            return NextResponse.json({ success: false, error, data: results }, { status: 200 });
        }

        return NextResponse.json({
            success: true,
            data: results,
            meta: { query: query.trim(), totalFound: results.length },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
