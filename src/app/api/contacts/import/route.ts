import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/contacts/import — Bulk import contacts from CSV data
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase
            .from('profiles')
            .select('tenant_id')
            .eq('id', user.id)
            .single();
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

        const body = await request.json();
        const { contacts } = body as { contacts: Array<{ phone: string; name?: string; email?: string; tags?: string[] }> };

        if (!Array.isArray(contacts) || contacts.length === 0) {
            return NextResponse.json({ error: 'contacts array is required' }, { status: 400 });
        }

        // Validate and normalize
        const normalized = contacts
            .filter(c => c.phone)
            .map(c => {
                let phone = c.phone.replace(/\D/g, '');
                if (phone.startsWith('08')) phone = '62' + phone.slice(1);
                else if (phone.startsWith('0')) phone = '62' + phone.slice(1);

                return {
                    tenant_id: profile.tenant_id,
                    phone,
                    name: c.name || null,
                    email: c.email || null,
                    tags: c.tags || [],
                    is_valid: phone.length >= 10 && phone.length <= 15,
                };
            });

        if (normalized.length === 0) {
            return NextResponse.json({ error: 'No valid contacts found' }, { status: 400 });
        }

        // Deduplicate by phone to prevent "ON CONFLICT DO UPDATE cannot affect row a second time"
        const deduped = Array.from(
            normalized.reduce((map, c) => map.set(c.phone, c), new Map()).values()
        );

        // Upsert in batches of 100 to avoid timeouts
        const batchSize = 100;
        let inserted = 0;
        let updated = 0;

        for (let i = 0; i < deduped.length; i += batchSize) {
            const batch = deduped.slice(i, i + batchSize);
            const { data, error } = await supabase
                .from('contacts')
                .upsert(batch, { onConflict: 'tenant_id,phone', ignoreDuplicates: false })
                .select();

            if (error) throw error;
            inserted += data?.length || 0;
        }

        return NextResponse.json({
            success: true,
            data: {
                total: deduped.length,
                imported: inserted,
                invalid: contacts.length - normalized.length,
                duplicates: normalized.length - deduped.length,
            },
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
