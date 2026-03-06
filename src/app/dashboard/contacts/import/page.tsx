'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { ArrowLeft, Upload, FileText, CheckCircle, AlertCircle, Loader2, Eye, Download } from 'lucide-react';

// Use a flexible record type to handle varied CSV column names
type ContactRow = {
    [key: string]: string | boolean | undefined;
    _valid?: boolean;
    _error?: string;
};

export default function ContactImportPage() {
    const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
    const [rows, setRows] = useState<ContactRow[]>([]);
    const [filename, setFilename] = useState('');
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ total: number; imported: number; invalid: number } | null>(null);
    const [error, setError] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    const handleFileChange = (file: File) => {
        setFilename(file.name);
        setError('');

        Papa.parse<ContactRow>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const parsed = (results.data as ContactRow[]).map(row => {
                    const phone = String(row.phone || row['Phone'] || row['PHONE'] || row['nomor'] || row['Nomor'] || '').trim();
                    let normalized = phone.replace(/\D/g, '');
                    if (normalized.startsWith('08')) normalized = '62' + normalized.slice(1);
                    else if (normalized.startsWith('0')) normalized = '62' + normalized.slice(1);

                    const valid = normalized.length >= 10 && normalized.length <= 15;
                    return {
                        phone: normalized || phone,
                        name: String(row.name || row['Name'] || row['NAME'] || row['nama'] || row['Nama'] || '').trim() || undefined,
                        email: String(row.email || row['Email'] || row['EMAIL'] || '').trim() || undefined,
                        tags: String(row.tags || row['Tags'] || row['TAG'] || '').trim() || undefined,
                        _valid: valid,
                        _error: !phone ? 'No phone' : !valid ? 'Invalid number' : undefined,
                    };
                });
                setRows(parsed);
                setStep('preview');
            },
            error: () => setError('Gagal membaca file CSV. Pastikan format benar.'),
        });
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
            handleFileChange(file);
        }
    };

    const handleImport = async () => {
        setImporting(true);
        setError('');

        const valid = rows.filter(r => r._valid);
        const contacts = valid.map(r => ({
            phone: String(r.phone || ''),
            name: r.name ? String(r.name) : undefined,
            email: r.email ? String(r.email) : undefined,
            tags: r.tags ? String(r.tags).split(',').map((t: string) => t.trim()).filter(Boolean) : [],
        }));

        try {
            const res = await fetch('/api/contacts/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contacts }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setResult(data.data);
            setStep('done');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setImporting(false);
        }
    };

    const validCount = rows.filter(r => r._valid).length;
    const invalidCount = rows.filter(r => !r._valid).length;

    return (
        <div>
            <div className="page-header">
                <div className="flex items-center gap-3">
                    <a href="/dashboard/contacts" className="btn btn-ghost btn-icon">
                        <ArrowLeft size={18} />
                    </a>
                    <div>
                        <h1 className="page-title">Import Kontak</h1>
                        <p className="page-description">Upload file CSV untuk import banyak kontak sekaligus</p>
                    </div>
                </div>
                <div className="page-actions">
                    <a
                        href="data:text/csv;charset=utf-8,phone,name,email,tags%0A628123456789,Budi Santoso,budi@email.com,pelanggan%0A628987654321,Siti Rahayu,siti@email.com,"
                        download="template_kontak.csv"
                        className="btn btn-secondary"
                    >
                        <Download size={16} /> Download Template
                    </a>
                </div>
            </div>

            {/* Upload Step */}
            {step === 'upload' && (
                <div style={{ maxWidth: 600, margin: '0 auto' }}>
                    <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
                        <h3 style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--text-md)' }}>Format CSV</h3>
                        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
                            File CSV harus memiliki header di baris pertama. Kolom yang didukung:
                        </p>
                        <div className="table-wrapper">
                            <table className="table">
                                <thead>
                                    <tr><th>Kolom</th><th>Wajib</th><th>Contoh</th></tr>
                                </thead>
                                <tbody>
                                    <tr><td><code>phone</code></td><td><span className="badge badge-danger">Wajib</span></td><td>628123456789</td></tr>
                                    <tr><td><code>name</code></td><td><span className="badge badge-default">Opsional</span></td><td>Budi Santoso</td></tr>
                                    <tr><td><code>email</code></td><td><span className="badge badge-default">Opsional</span></td><td>budi@email.com</td></tr>
                                    <tr><td><code>tags</code></td><td><span className="badge badge-default">Opsional</span></td><td>pelanggan,vip</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {error && <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--color-danger-soft)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 'var(--text-sm)' }}>{error}</div>}

                    <div
                        className="upload-zone"
                        onDrop={handleDrop}
                        onDragOver={e => e.preventDefault()}
                        onClick={() => fileRef.current?.click()}
                    >
                        <Upload size={48} style={{ color: 'var(--color-accent)', marginBottom: 'var(--space-4)' }} />
                        <h3>Drop file CSV di sini</h3>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', margin: 'var(--space-2) 0' }}>
                            atau klik untuk browse file
                        </p>
                        <span className="badge badge-default">CSV hingga 10MB</span>
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".csv,text/csv"
                            style={{ display: 'none' }}
                            onChange={e => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                        />
                    </div>
                </div>
            )}

            {/* Preview Step */}
            {step === 'preview' && (
                <div>
                    <div className="flex items-center gap-4" style={{ marginBottom: 'var(--space-4)' }}>
                        <div className="card" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <FileText size={20} style={{ color: 'var(--color-accent)' }} />
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{filename}</div>
                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{rows.length} baris ditemukan</div>
                            </div>
                        </div>
                        <div className="card" style={{ flex: 1 }}>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Kontak Valid</div>
                            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-success)' }}>{validCount}</div>
                        </div>
                        <div className="card" style={{ flex: 1 }}>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Tidak Valid</div>
                            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: invalidCount > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>{invalidCount}</div>
                        </div>
                    </div>

                    {error && <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--color-danger-soft)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 'var(--text-sm)' }}>{error}</div>}

                    <div className="table-wrapper" style={{ marginBottom: 'var(--space-4)', maxHeight: 400, overflowY: 'auto' }}>
                        <table className="table">
                            <thead>
                                <tr><th>#</th><th>Telepon</th><th>Nama</th><th>Email</th><th>Tags</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                {rows.slice(0, 200).map((row, i) => (
                                    <tr key={i}>
                                        <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>{i + 1}</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)' }}>{row.phone}</td>
                                        <td>{row.name || '-'}</td>
                                        <td>{row.email || '-'}</td>
                                        <td>{row.tags || '-'}</td>
                                        <td>
                                            {row._valid
                                                ? <span className="badge badge-success"><CheckCircle size={10} /> Valid</span>
                                                : <span className="badge badge-danger" title={row._error}><AlertCircle size={10} /> {row._error}</span>
                                            }
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {rows.length > 200 && (
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
                            Menampilkan 200 dari {rows.length} baris
                        </p>
                    )}

                    <div className="flex gap-3" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary" onClick={() => { setStep('upload'); setRows([]); }}>← Ganti File</button>
                        <button
                            className="btn btn-primary"
                            disabled={validCount === 0 || importing}
                            onClick={handleImport}
                        >
                            {importing ? <><Loader2 size={16} className="animate-spin" /> Mengimport...</> : `Import ${validCount} Kontak`}
                        </button>
                    </div>
                </div>
            )}

            {/* Done Step */}
            {step === 'done' && result && (
                <div style={{ maxWidth: 480, margin: '0 auto' }}>
                    <div className="card" style={{ textAlign: 'center', padding: 'var(--space-10)' }}>
                        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--color-success-soft)', color: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-4)' }}>
                            <CheckCircle size={36} />
                        </div>
                        <h2 style={{ marginBottom: 'var(--space-2)' }}>Import Berhasil!</h2>
                        <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)' }}>
                            Kontak berhasil diimpor ke database.
                        </p>
                        <div className="grid grid-cols-3" style={{ marginBottom: 'var(--space-6)' }}>
                            <div>
                                <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700 }}>{result.total}</div>
                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Total Baris</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-success)' }}>{result.imported}</div>
                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Diimport</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: result.invalid > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>{result.invalid}</div>
                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Tidak Valid</div>
                            </div>
                        </div>
                        <div className="flex gap-3" style={{ justifyContent: 'center' }}>
                            <button className="btn btn-secondary" onClick={() => { setStep('upload'); setRows([]); setResult(null); }}>Import Lagi</button>
                            <a href="/dashboard/contacts" className="btn btn-primary">Lihat Kontak →</a>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
        .upload-zone {
          border: 2px dashed var(--color-border);
          border-radius: var(--radius-xl);
          padding: var(--space-12) var(--space-8);
          text-align: center;
          cursor: pointer;
          transition: all var(--transition-base);
          background: var(--color-bg-secondary);
        }
        .upload-zone:hover {
          border-color: var(--color-accent);
          background: var(--color-accent-soft);
        }
        .upload-zone h3 {
          margin-bottom: 0;
        }
      `}</style>
        </div>
    );
}
