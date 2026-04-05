import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/autoreply/[id]/knowledge/upload — upload Excel/PDF file and extract text
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: ruleId } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase
            .from('profiles')
            .select('tenant_id')
            .eq('id', user.id)
            .single();
        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const title = formData.get('title') as string || '';
        const category = formData.get('category') as string || 'general';

        if (!file) return NextResponse.json({ error: 'File is required' }, { status: 400 });
        if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

        const fileName = file.name.toLowerCase();
        const buffer = Buffer.from(await file.arrayBuffer());
        let extractedText = '';

        // === PDF Parsing ===
        if (fileName.endsWith('.pdf')) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const pdfParse = require('pdf-parse');
                const pdfData = await pdfParse(buffer);
                extractedText = pdfData.text || '';
            } catch (pdfErr: any) {
                console.error('PDF parse error:', pdfErr);
                return NextResponse.json({ error: 'Gagal membaca PDF: ' + pdfErr.message }, { status: 400 });
            }
        }
        // === Excel Parsing ===
        else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
            try {
                const XLSX = await import('xlsx');
                const workbook = XLSX.read(buffer, { type: 'buffer' });

                const allSheets: string[] = [];
                for (const sheetName of workbook.SheetNames) {
                    const sheet = workbook.Sheets[sheetName];
                    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

                    if (!data || data.length === 0) continue;

                    // Use first row as headers
                    const headers = (data[0] as string[]).map(h => String(h || '').trim());
                    const rows = data.slice(1).filter(row => row.some(cell => cell !== null && cell !== undefined && cell !== ''));

                    if (rows.length === 0) continue;

                    // Build readable text from sheet
                    let sheetText = `[Sheet: ${sheetName}]\n`;

                    // If sheet has clear headers, format as structured data
                    if (headers.length > 0 && headers.some(h => h)) {
                        sheetText += `Kolom: ${headers.filter(Boolean).join(' | ')}\n\n`;
                        for (const row of rows) {
                            const items = headers
                                .map((h, i) => {
                                    const val = row[i];
                                    if (val === null || val === undefined || val === '') return null;
                                    return h ? `${h}: ${val}` : `${val}`;
                                })
                                .filter(Boolean);
                            sheetText += items.join(' | ') + '\n';
                        }
                    } else {
                        // Fallback: just list values
                        for (const row of data) {
                            sheetText += (row as unknown[]).map(c => String(c ?? '')).join(' | ') + '\n';
                        }
                    }

                    allSheets.push(sheetText);
                }

                extractedText = allSheets.join('\n\n');
            } catch (xlsErr: any) {
                console.error('Excel parse error:', xlsErr);
                return NextResponse.json({ error: 'Gagal membaca Excel: ' + xlsErr.message }, { status: 400 });
            }
        }
        // === Text files ===
        else if (fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.csv')) {
            extractedText = buffer.toString('utf-8');
        }
        else {
            return NextResponse.json({ error: 'Format file tidak didukung. Gunakan .pdf, .xlsx, .xls, .csv, .txt' }, { status: 400 });
        }

        if (!extractedText.trim()) {
            return NextResponse.json({ error: 'File kosong atau tidak bisa diekstrak' }, { status: 400 });
        }

        // Save to database
        const { data, error } = await supabase
            .from('ai_knowledge_files')
            .insert({
                tenant_id: profile.tenant_id,
                rule_id: ruleId,
                title,
                category,
                content: extractedText,
                source_type: fileName.endsWith('.pdf') ? 'pdf'
                    : (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) ? 'excel'
                    : fileName.endsWith('.csv') ? 'csv'
                    : 'text',
                file_name: file.name,
            })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({
            success: true,
            data,
            stats: {
                characters: extractedText.length,
                lines: extractedText.split('\n').length,
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
