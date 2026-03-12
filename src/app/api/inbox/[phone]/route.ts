import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProvider, formatPhone } from '@/lib/wa-provider';

// GET /api/inbox/[phone] — Get all messages for a phone number
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ phone: string }> }
) {
    try {
        const { phone } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: messages, error } = await supabase
            .from('messages')
            .select('*')
            .eq('phone', decodeURIComponent(phone))
            .order('created_at', { ascending: true })
            .limit(100);

        if (error) throw error;
        const response = NextResponse.json({ success: true, data: messages });
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        return response;
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
