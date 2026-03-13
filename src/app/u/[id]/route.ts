import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        const { data: link, error } = await supabase
            .from('short_links')
            .select('target_url')
            .eq('id', id)
            .single();

        if (error || !link) {
            return new NextResponse('Link tidak ditemukan atau sudah kadaluarsa.', { status: 404 });
        }

        return NextResponse.redirect(link.target_url);

    } catch (error: any) {
        console.error('Shortlink redirect error:', error);
        return new NextResponse('Terjadi kesalahan internal peladen.', { status: 500 });
    }
}
