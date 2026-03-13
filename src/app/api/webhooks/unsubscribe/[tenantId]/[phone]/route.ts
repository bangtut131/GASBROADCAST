import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ tenantId: string, phone: string }> }
) {
    try {
        const { tenantId, phone: encodedPhone } = await params;
        const supabase = await createClient();

        // Decode phone (base64)
        const phone = Buffer.from(encodedPhone, 'base64').toString('utf-8');

        // Insert into blacklist ignoring conflicts
        const { error } = await supabase
            .from('blacklisted_contacts')
            .upsert(
                { tenant_id: tenantId, phone, reason: 'unsubscribed via link' },
                { onConflict: 'tenant_id,phone' }
            );

        if (error) {
            console.error('Unsubscribe error:', error.message);
            throw error;
        }

        const html = `
            <!DOCTYPE html>
            <html lang="id">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Berhenti Berlangganan</title>
                <style>
                    body { font-family: system-ui, -apple-system, sans-serif; background: #f3f4f6; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; color: #1f2937; }
                    .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; max-width: 400px; width: 90%; }
                    .icon { color: #10b981; font-size: 48px; margin-bottom: 1rem; }
                    h1 { font-size: 1.5rem; margin: 0 0 0.5rem 0; color: #111827; }
                    p { margin: 0; color: #4b5563; line-height: 1.5; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">✓</div>
                    <h1>Berhasil Unsubscribe</h1>
                    <p>Nomor <b>${phone}</b> telah diblokir dari daftar kami.</p>
                    <p style="margin-top: 1rem; font-size: 0.875rem;">Anda tidak akan menerima pesan penawaran lagi di masa mendatang.</p>
                </div>
            </body>
            </html>
        `;

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html' },
        });

    } catch (error: any) {
        return new NextResponse('Terjadi kesalahan atau link tidak valid.', { status: 500 });
    }
}
