'use client';

import { useState } from 'react';
import {
    MapPin, Search, Loader2, Phone, Star, Download,
    Users, Send, ArrowLeft, ExternalLink, Globe,
    CheckCircle, AlertCircle, Building2, Import
} from 'lucide-react';

interface Business {
    name: string;
    phone: string;
    address: string;
    category: string;
    rating: string;
    reviewCount: string;
    website: string;
    placeUrl: string;
    selected?: boolean;
}

export default function LeadsPage() {
    const [query, setQuery] = useState('');
    const [maxResults, setMaxResults] = useState(30);
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<Business[]>([]);
    const [error, setError] = useState('');
    const [searched, setSearched] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importSuccess, setImportSuccess] = useState('');

    const handleScrape = async () => {
        if (!query.trim() || query.trim().length < 3) {
            setError('Masukkan kata kunci minimal 3 karakter');
            return;
        }
        setLoading(true);
        setError('');
        setResults([]);
        setSearched(true);
        setImportSuccess('');

        try {
            const res = await fetch('/api/scraper/google-maps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: query.trim(), maxResults }),
            });
            const data = await res.json();
            if (data.data && data.data.length > 0) {
                setResults(data.data.map((b: Business) => ({ ...b, selected: true })));
            } else {
                setError(data.error || 'Tidak ada hasil ditemukan');
            }
        } catch (err: any) {
            setError('Gagal menjalankan scraper: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleAll = (checked: boolean) => {
        setResults(prev => prev.map(r => ({ ...r, selected: checked })));
    };

    const toggleOne = (idx: number) => {
        setResults(prev => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
    };

    const selectedCount = results.filter(r => r.selected).length;
    const withPhone = results.filter(r => r.phone).length;

    const handleImportContacts = async () => {
        const selected = results.filter(r => r.selected && r.phone);
        if (selected.length === 0) {
            setError('Tidak ada data dengan nomor telepon yang bisa diimport');
            return;
        }
        setImporting(true);
        setError('');
        try {
            const res = await fetch('/api/contacts/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contacts: selected.map(b => ({
                        phone: b.phone.replace(/\D/g, ''),
                        name: b.name,
                        tags: [b.category || 'google-maps'].filter(Boolean),
                        notes: `${b.address || ''} | Rating: ${b.rating || '-'} | ${b.website || ''}`.trim(),
                    })),
                }),
            });
            const data = await res.json();
            if (data.success) {
                setImportSuccess(`✅ ${selected.length} kontak berhasil diimport ke Contacts!`);
            } else {
                setError(data.error || 'Gagal import');
            }
        } catch (err: any) {
            setError('Gagal import: ' + err.message);
        } finally {
            setImporting(false);
        }
    };

    const handleExportCSV = () => {
        const selected = results.filter(r => r.selected);
        if (selected.length === 0) return;
        const headers = ['name', 'phone', 'address', 'category', 'rating', 'website'];
        const csv = [
            headers.join(','),
            ...selected.map(b => headers.map(h => `"${(b as any)[h] || ''}"`).join(','))
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `leads_${query.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div>
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <a href="/dashboard" className="btn btn-ghost btn-icon"><ArrowLeft size={18} /></a>
                    <div>
                        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <MapPin size={22} style={{ color: '#ef4444' }} /> Leads Scraper
                        </h1>
                        <p className="page-description">Cari data bisnis dari Google Maps untuk lead generation</p>
                    </div>
                </div>
            </div>

            {/* Search Form */}
            <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ flex: 1, minWidth: 260, marginBottom: 0 }}>
                        <label className="form-label">🔍 Kata Kunci + Lokasi</label>
                        <input
                            className="form-input"
                            placeholder="contoh: Restoran di Bandung, Hotel Jakarta, Bengkel Motor Surabaya"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !loading && handleScrape()}
                        />
                    </div>
                    <div className="form-group" style={{ width: 120, marginBottom: 0 }}>
                        <label className="form-label">Maks Hasil</label>
                        <select className="form-select" value={maxResults} onChange={e => setMaxResults(+e.target.value)}>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={30}>30</option>
                            <option value={40}>40</option>
                            <option value={60}>60</option>
                        </select>
                    </div>
                    <button className="btn btn-primary" onClick={handleScrape} disabled={loading} style={{ height: 42 }}>
                        {loading ? <><Loader2 size={16} className="animate-spin" /> Scraping...</> : <><Search size={16} /> Mulai Scraping</>}
                    </button>
                </div>

                {loading && (
                    <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--color-accent-soft)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-accent)', margin: '0 auto var(--space-2)' }} />
                        <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-accent)' }}>Sedang mencari data bisnis...</p>
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                            Proses ini membutuhkan 30-90 detik. Mohon tunggu dan jangan refresh halaman.
                        </p>
                    </div>
                )}
            </div>

            {error && (
                <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-danger-soft)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            {importSuccess && (
                <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-success-soft)', color: 'var(--color-success)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <CheckCircle size={16} /> {importSuccess}
                </div>
            )}

            {/* Results */}
            {results.length > 0 && (
                <>
                    {/* Stats bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                        <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Building2 size={14} /> <strong>{results.length}</strong> bisnis ditemukan
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: withPhone > 0 ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                                <Phone size={14} /> <strong>{withPhone}</strong> punya telepon
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-accent)' }}>
                                <CheckCircle size={14} /> <strong>{selectedCount}</strong> dipilih
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                            <button className="btn btn-sm btn-secondary" onClick={handleExportCSV} disabled={selectedCount === 0}>
                                <Download size={14} /> Export CSV
                            </button>
                            <button className="btn btn-sm btn-primary" onClick={handleImportContacts} disabled={importing || selectedCount === 0} style={{ background: '#22c55e', borderColor: '#22c55e' }}>
                                {importing ? <><Loader2 size={14} className="animate-spin" /> Importing...</> : <><Users size={14} /> Import ke Contacts</>}
                            </button>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)' }}>
                                    <th style={{ padding: 'var(--space-2) var(--space-3)', width: 36 }}>
                                        <input type="checkbox" checked={selectedCount === results.length} onChange={e => toggleAll(e.target.checked)} />
                                    </th>
                                    <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Bisnis</th>
                                    <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Telepon</th>
                                    <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Alamat</th>
                                    <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Rating</th>
                                    <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Link</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((biz, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)', opacity: biz.selected ? 1 : 0.5, transition: 'opacity 0.15s' }}>
                                        <td style={{ padding: 'var(--space-2) var(--space-3)' }}>
                                            <input type="checkbox" checked={biz.selected} onChange={() => toggleOne(i)} />
                                        </td>
                                        <td style={{ padding: 'var(--space-2) var(--space-3)' }}>
                                            <div style={{ fontWeight: 600 }}>{biz.name}</div>
                                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{biz.category}</div>
                                        </td>
                                        <td style={{ padding: 'var(--space-2) var(--space-3)' }}>
                                            {biz.phone ? (
                                                <span style={{ color: 'var(--color-success)', fontFamily: 'monospace', fontSize: 'var(--text-xs)' }}>{biz.phone}</span>
                                            ) : (
                                                <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontStyle: 'italic' }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {biz.address || '—'}
                                        </td>
                                        <td style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center' }}>
                                            {biz.rating ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 'var(--text-xs)' }}>
                                                    <Star size={12} style={{ color: '#F59E0B', fill: '#F59E0B' }} /> {biz.rating}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                                {biz.placeUrl && (
                                                    <a href={biz.placeUrl} target="_blank" rel="noopener noreferrer" title="Buka di Google Maps" style={{ color: 'var(--color-accent)' }}>
                                                        <MapPin size={14} />
                                                    </a>
                                                )}
                                                {biz.website && (
                                                    <a href={biz.website} target="_blank" rel="noopener noreferrer" title="Website" style={{ color: 'var(--color-info)' }}>
                                                        <Globe size={14} />
                                                    </a>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* Empty state */}
            {searched && !loading && results.length === 0 && !error && (
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                    <MapPin size={40} style={{ color: 'var(--color-text-muted)', margin: '0 auto var(--space-3)' }} />
                    <p style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>Tidak ada hasil</p>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Coba dengan kata kunci yang lebih spesifik, misalnya: "Toko Bangunan Semarang"</p>
                </div>
            )}

            {/* Tips */}
            {!searched && (
                <div className="card" style={{ background: 'var(--color-bg-tertiary)' }}>
                    <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-3)' }}>💡 Tips Penggunaan</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
                        <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                            <strong>✅ Kata kunci yang baik:</strong>
                            <ul style={{ margin: '4px 0 0 16px', color: 'var(--color-text-muted)' }}>
                                <li>"Restoran Padang di Jakarta Selatan"</li>
                                <li>"Bengkel Motor Bandung"</li>
                                <li>"Salon kecantikan Surabaya"</li>
                                <li>"Toko bangunan Semarang"</li>
                            </ul>
                        </div>
                        <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                            <strong>⚠️ Perhatian:</strong>
                            <ul style={{ margin: '4px 0 0 16px', color: 'var(--color-text-muted)' }}>
                                <li>Proses scraping butuh 30–90 detik</li>
                                <li>Tidak semua bisnis punya nomor HP</li>
                                <li>Maks 60 hasil per pencarian</li>
                                <li>Jangan scraping terlalu sering (&gt;5x/jam)</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
