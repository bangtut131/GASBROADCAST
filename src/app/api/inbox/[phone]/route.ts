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
            .neq('message_type', 'status')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        
        // Reverse so the oldest of the 100 is at the top, and newest is at the bottom
        const sortedMessages = messages ? messages.reverse() : [];
        
        const response = NextResponse.json({ success: true, data: sortedMessages });
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        return response;
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH /api/inbox/[phone] — Mark conversation as read/unread
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ phone: string }> }
) {
    try {
        const { phone } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { is_read } = body;

        const { error } = await supabase
            .from('messages')
            .update({ is_read })
            .eq('phone', decodeURIComponent(phone));

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE /api/inbox/[phone] — Delete a specific message or entire conversation
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ phone: string }> }
) {
    try {
        const { phone } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const messageId = searchParams.get('id');

        let query = supabase.from('messages').delete().eq('phone', decodeURIComponent(phone));
        if (messageId) {
            query = query.eq('id', messageId);
        }

        const { error } = await query;
        if (error) throw error;
        
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
