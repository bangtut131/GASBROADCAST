'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
    MapPin, Search, Loader2, Phone, Star, Download,
    Users, ArrowLeft, Globe, CheckCircle, AlertCircle, 
    Building2, Clock, History, PlayCircle
} from 'lucide-react';

interface Business {
    name: string;
    phone: string;
    address: string;
    hours: string;
    category: string;
    rating: string;
    reviewCount: string;
    website: string;
    placeUrl: string;
    selected?: boolean;
}

interface ScraperJob {
    id: string;
    query: string;
    max_results: number;
    status: 'processing' | 'completed' | 'failed';
    count_found: number;
    results: Business[];
    error_message: string;
    created_at: string;
    completed_at: string;
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
    
    // Background Job States
    const [activeTab, setActiveTab] = useState<'search' | 'history'>('search');
    const [jobs, setJobs] = useState<ScraperJob[]>([]);
    const [jobsLoading, setJobsLoading] = useState(true);
    
    const supabase = createClient();

    // Load jobs history
    useEffect(() => {
        const fetchJobs = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            
            const { data } = await supabase
                .from('scraper_jobs')
                .select('*')
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false })
                .limit(50);
                
            if (data) setJobs(data);
            setJobsLoading(false);
        };
        fetchJobs();

        // Subscribe to real-time updates for jobs
        const channel = supabase.channel('jobs_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'scraper_jobs' }, (payload) => {
                fetchJobs(); // Re-fetch on any change to keep data fresh
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [supabase]);

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
            
            if (data.success && data.jobId) {
                // Background job started successfully
                setImportSuccess(data.message || 'Scraping berjalan di latar belakang!');
                setQuery('');
                setActiveTab('history'); // Switch to history to see the progress
            } else {
                setError(data.error || 'Gagal memulai scraper');
            }
        } catch (err: any) {
            setError('Gagal menghubungi server: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const loadJobResults = (job: ScraperJob) => {
        if (!job.results || job.results.length === 0) {
            setError('Job ini tidak memiliki hasil.');
            return;
        }
        setSearched(true);
        setResults(job.results.map((b: Business) => ({ ...b, selected: true })));
        setActiveTab('search');
        setImportSuccess(`Menampilkan ${job.results.length} hasil untuk "${job.query}"`);
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
        const headers = ['name', 'phone', 'address', 'hours', 'category', 'rating', 'website'];
        const csv = [
            headers.join(','),
            ...selected.map(b => headers.map(h => `"${(b as any)[h] || ''}"`).join(','))
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `leads_${new Date().getTime()}.csv`;
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
                        <p className="page-description">Cari data bisnis dari Google Maps otomatis ke Latar Belakang</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-2)' }}>
                <button 
                    onClick={() => setActiveTab('search')}
                    className={`btn ${activeTab === 'search' ? 'btn-primary' : 'btn-ghost'}`} 
                    style={{ borderRadius: 'var(--radius-lg)' }}
                >
                    <Search size={16} /> Data Baru
                </button>
                <button 
                    onClick={() => setActiveTab('history')}
                    className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-ghost'}`} 
                    style={{ borderRadius: 'var(--radius-lg)' }}
                >
                    <History size={16} /> Riwayat Pencarian {jobs.filter(j => j.status === 'processing').length > 0 && <span style={{ background: '#ef4444', color: 'white', padding: '2px 6px', borderRadius: 12, fontSize: 10 }}>{jobs.filter(j => j.status === 'processing').length} Jalan</span>}
                </button>
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

            {activeTab === 'search' && (
                <>
                    {/* Search Form */}
                    <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
                        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div className="form-group" style={{ flex: 1, minWidth: 260, marginBottom: 0 }}>
                                <label className="form-label">🔍 Kata Kunci + Lokasi</label>
                                <input
                                    className="form-input"
                                    placeholder="contoh: Restoran di Bandung, Bengkel Motor Surabaya"
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
                                    <option value={80}>80</option>
                                    <option value={100}>100</option>
                                    <option value={120}>120</option>
                                </select>
                            </div>
                            <button className="btn btn-primary" onClick={handleScrape} disabled={loading} style={{ height: 42 }}>
                                {loading ? <><Loader2 size={16} className="animate-spin" /> Mengirim...</> : <><PlayCircle size={16} /> Jalankan di Latar Belakang</>}
                            </button>
                        </div>
                        
                        <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
                            <Clock size={12} /> Pencarian ini aman dan tidak akan menyebabkan layar nge-hang karena berjalan otomatis di latar belakang server.
                        </div>
                    </div>

                    {/* Results */}
                    {results.length > 0 && (
                        <>
                            {/* Stats bar */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                                <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Building2 size={14} /> <strong>{results.length}</strong> bisnis
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
                                        {importing ? <><Loader2 size={14} className="animate-spin" /> Importing...</> : <><Users size={14} /> Import Kontak</>}
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

                    {!searched && results.length === 0 && !error && (
                        <div className="card" style={{ background: 'var(--color-bg-tertiary)' }}>
                            <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-3)' }}>💡 Cara Menggunakan Data Latar Belakang</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
                                <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                                    <strong>✅ 1. Masukkan Kata Kunci Bebas</strong>
                                    <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-muted)' }}>
                                       Misal: "Apotek Jakarta Pusat", "Klinik Kecantikan Bandung". Anda bisa pilih sampai 120 hasil maksimal.
                                    </p>
                                </div>
                                <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                                    <strong>✅ 2. Cek Riwayat Pencarian</strong>
                                    <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-muted)' }}>
                                        Browser tidak akan loading memutar-mutar lagi. Proses berjalan mandiri di server. Jika selesai, klik tombol <strong>"Lihat Hasil"</strong> di tab Riwayat Pencarian.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {activeTab === 'history' && (
                <div className="card" style={{ padding: 0, overflow: 'auto' }}>
                    <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: 'var(--text-md)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <History size={18} /> Antrean & Riwayat Scraper
                        </h3>
                    </div>
                    {jobsLoading ? (
                        <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
                            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto', color: 'var(--color-text-muted)' }} />
                            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 8 }}>Memuat riwayat...</p>
                        </div>
                    ) : jobs.length === 0 ? (
                        <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
                            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Belum ada riwayat proses.</p>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)' }}>
                                    <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Status</th>
                                    <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Pencarian</th>
                                    <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Target</th>
                                    <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Hasil Ditemukan</th>
                                    <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Tanggal</th>
                                    <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'right', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {jobs.map((job) => (
                                    <tr key={job.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ padding: 'var(--space-3)' }}>
                                            {job.status === 'processing' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-warning)', background: 'var(--color-warning-soft)', padding: '4px 10px', borderRadius: 12, fontSize: 'var(--text-xs)', fontWeight: 600 }}><Loader2 size={12} className="animate-spin" /> Prosesing</span>}
                                            {job.status === 'completed' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-success)', background: 'var(--color-success-soft)', padding: '4px 10px', borderRadius: 12, fontSize: 'var(--text-xs)', fontWeight: 600 }}><CheckCircle size={12} /> Selesai</span>}
                                            {job.status === 'failed' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-danger)', background: 'var(--color-danger-soft)', padding: '4px 10px', borderRadius: 12, fontSize: 'var(--text-xs)', fontWeight: 600 }}><AlertCircle size={12} /> Gagal</span>}
                                        </td>
                                        <td style={{ padding: 'var(--space-3)', fontWeight: 600 }}>{job.query}</td>
                                        <td style={{ padding: 'var(--space-3)' }}>{job.max_results}</td>
                                        <td style={{ padding: 'var(--space-3)' }}>
                                            {job.status === 'processing' ? '...' : (
                                                <span style={{ fontWeight: 600, color: job.count_found > 0 ? 'var(--color-success)' : 'inherit' }}>{job.count_found} data</span>
                                            )}
                                            {job.status === 'failed' && <div style={{ fontSize: 11, color: 'var(--color-danger)' }}>{job.error_message}</div>}
                                        </td>
                                        <td style={{ padding: 'var(--space-3)', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                            {new Date(job.created_at).toLocaleString('id-ID')}
                                        </td>
                                        <td style={{ padding: 'var(--space-3)', textAlign: 'right' }}>
                                            {job.status === 'completed' && job.count_found > 0 && (
                                                <button className="btn btn-sm btn-primary" onClick={() => loadJobResults(job)}>
                                                    Lihat Hasil
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
}
