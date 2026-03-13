'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Image, Video, FileText, Plus, Trash2, Power, Play,
    Clock, RefreshCw, Settings, BarChart2, Loader2, X,
    Upload, Tag, Shuffle, List, History, ChevronDown, ChevronUp,
    AlertCircle, CheckCircle, Calendar, Eye, Copy
} from 'lucide-react';

// ======== Types ========
interface Category { id: string; name: string; color: string; icon: string; content_count: number }
interface Content { id: string; type: 'image' | 'video' | 'text'; title: string | null; content_url: string | null; caption: string | null; category_id: string | null; category?: Category; tags: string[]; use_count: number; last_used_at: string | null; created_at: string }
interface Device { id: string; name: string; phone_number: string | null; status: string }
interface Schedule { id: string; name: string; device_id: string; device?: Device; device_ids?: string[]; devices?: Device[]; mode: string; times_of_day: string[]; days_of_week: number[]; category_ids: string[]; content_ids: string[]; window_start: string; window_end: string; cooldown_days: number; caption_template: string | null; caption_templates: string[]; is_active: boolean; last_posted_at: string | null; total_posted: number }
interface Log { id: string; content_id: string; schedule_id: string; device?: Device; status: string; error_message: string | null; posted_at: string }

type ActiveTab = 'library' | 'schedules' | 'history';

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const COLORS = ['#6C63FF', '#25D366', '#3B82F6', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#14B8A6'];
const ICONS = ['📁', '🖼️', '🎬', '🎯', '💡', '🔥', '⭐', '🎁', '📣', '🏷️', '🌟', '💼'];

export default function WAStatusPage() {
    const [tab, setTab] = useState<ActiveTab>('library');
    const [categories, setCategories] = useState<Category[]>([]);
    const [contents, setContents] = useState<Content[]>([]);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [logs, setLogs] = useState<Log[]>([]);
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [contentTypeFilter, setContentTypeFilter] = useState<string>('all');

    // Modals
    const [showAddContent, setShowAddContent] = useState(false);
    const [showAddCategory, setShowAddCategory] = useState(false);
    const [showAddSchedule, setShowAddSchedule] = useState(false);
    const [posting, setPosting] = useState<string | null>(null);
    const [error, setError] = useState('');

    // Forms
    const [contentForm, setContentForm] = useState({ type: 'image' as 'image' | 'video' | 'text', title: '', content_url: '', storage_path: '', caption: '', category_id: '', tags: '' });
    const [catForm, setCatForm] = useState({ name: '', color: '#6C63FF', icon: '📁' });
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [schedForm, setSchedForm] = useState({
        name: '', device_ids: [] as string[], mode: 'random',
        category_ids: [] as string[],
        content_ids: [] as string[],
        times_of_day: ['08:00', '12:00', '18:00'],
        days_of_week: [0, 1, 2, 3, 4, 5, 6],
        window_start: '07:00', window_end: '21:00',
        cooldown_days: 3, caption_template: '', caption_templates: [''] as string[],
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => { loadAll(); }, []);

    const loadAll = async () => {
        setLoading(true);
        const [cats, devs] = await Promise.all([
            fetch('/api/wa-status/categories').then(r => r.json()),
            fetch('/api/devices').then(r => r.json()),
        ]);
        if (cats.success) setCategories(cats.data);
        if (devs.success) setDevices(devs.data.filter((d: Device) => d.status === 'connected'));
        await loadContents();
        await loadSchedules();
        await loadLogs();
        setLoading(false);
    };

    const loadContents = async () => {
        let url = '/api/wa-status/contents?';
        if (selectedCategory !== 'all') url += `category_id=${selectedCategory}&`;
        if (contentTypeFilter !== 'all') url += `type=${contentTypeFilter}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.success) setContents(data.data);
    };

    const loadSchedules = async () => {
        const res = await fetch('/api/wa-status/schedules');
        const data = await res.json();
        if (data.success) setSchedules(data.data);
    };

    const loadLogs = async () => {
        const res = await fetch('/api/wa-status/logs?limit=50');
        const data = await res.json();
        if (data.success) setLogs(data.data);
    };

    useEffect(() => { loadContents(); }, [selectedCategory, contentTypeFilter]);

    const handleAddContent = async () => {
        setSaving(true); setError('');
        try {
            const body = {
                ...contentForm,
                tags: contentForm.tags.split(',').map(t => t.trim()).filter(Boolean),
                category_id: contentForm.category_id || null,
            };
            const res = await fetch('/api/wa-status/contents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            await loadContents();
            setShowAddContent(false);
            setContentForm({ type: 'image', title: '', content_url: '', storage_path: '', caption: '', category_id: '', tags: '' });
        } catch (e: any) { setError(e.message); }
        finally { setSaving(false); }
    };

    const handleFileUpload = async (file: File) => {
        if (!file) return;
        setUploading(true); setUploadProgress(10); setError('');
        try {
            const form = new FormData();
            form.append('file', file);
            setUploadProgress(40);
            const res = await fetch('/api/wa-status/upload', { method: 'POST', body: form });
            setUploadProgress(80);
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setContentForm(f => ({
                ...f,
                content_url: data.data.url,
                storage_path: data.data.path,
                type: data.data.type as 'image' | 'video',
                title: f.title || file.name.replace(/\.[^.]+$/, ''),
            }));
            setUploadProgress(100);
        } catch (e: any) { setError(e.message); }
        finally { setUploading(false); setTimeout(() => setUploadProgress(0), 800); }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
    };

    const handleAddCategory = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/wa-status/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(catForm) });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setCategories(prev => [...prev, { ...data.data, content_count: 0 }]);
            setShowAddCategory(false);
            setCatForm({ name: '', color: '#6C63FF', icon: '📁' });
        } catch (e: any) { setError(e.message); }
        finally { setSaving(false); }
    };

    const handleAddSchedule = async () => {
        if (schedForm.device_ids.length === 0) { setError('Pilih minimal 1 perangkat'); return; }
        setSaving(true); setError('');
        try {
            const res = await fetch('/api/wa-status/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(schedForm) });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setSchedules(prev => [data.data, ...prev]);
            setShowAddSchedule(false);
        } catch (e: any) { setError(e.message); }
        finally { setSaving(false); }
    };

    const toggleSchedule = async (id: string, current: boolean) => {
        await fetch(`/api/wa-status/schedules/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !current }) });
        setSchedules(prev => prev.map(s => s.id === id ? { ...s, is_active: !current } : s));
    };

    const deleteSchedule = async (id: string) => {
        if (!confirm('Hapus jadwal ini? Riwayat posting tidak akan dihapus.')) return;
        await fetch(`/api/wa-status/schedules/${id}`, { method: 'DELETE' });
        setSchedules(prev => prev.filter(s => s.id !== id));
    };

    const deleteContent = async (id: string) => {
        if (!confirm('Hapus konten ini?')) return;
        await fetch(`/api/wa-status/contents/${id}`, { method: 'DELETE' });
        setContents(prev => prev.filter(c => c.id !== id));
    };

    const postNow = async (scheduleId: string) => {
        setPosting(scheduleId);
        try {
            const res = await fetch('/api/wa-status/post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schedule_id: scheduleId }) });
            const data = await res.json();
            if (!data.success) alert('Gagal post: ' + (data.error || 'Unknown error'));
            else { alert('✅ Status berhasil diposting!'); await loadSchedules(); await loadLogs(); }
        } catch { } finally { setPosting(null); }
    };

    const duplicateSchedule = (s: Schedule) => {
        setSchedForm({
            name: `${s.name} (copy)`,
            device_ids: [],  // Force user to pick devices
            mode: s.mode,
            category_ids: [...(s.category_ids || [])],
            content_ids: [...(s.content_ids || [])],
            times_of_day: [...s.times_of_day],
            days_of_week: [...s.days_of_week],
            window_start: s.window_start,
            window_end: s.window_end,
            cooldown_days: s.cooldown_days,
            caption_template: s.caption_template || '',
            caption_templates: s.caption_templates?.length > 0 ? [...s.caption_templates] : [s.caption_template || ''],
        });
        setShowAddSchedule(true);
    };

    const toggleDevice = (id: string) => {
        setSchedForm(f => ({
            ...f,
            device_ids: f.device_ids.includes(id) ? f.device_ids.filter(d => d !== id) : [...f.device_ids, id],
        }));
    };

    const toggleDay = (day: number) => {
        setSchedForm(f => ({
            ...f,
            days_of_week: f.days_of_week.includes(day) ? f.days_of_week.filter(d => d !== day) : [...f.days_of_week, day].sort(),
        }));
    };

    const toggleCategory = (id: string) => {
        setSchedForm(f => ({
            ...f,
            category_ids: f.category_ids.includes(id) ? f.category_ids.filter(c => c !== id) : [...f.category_ids, id],
        }));
    };

    const toggleContentSelection = (id: string) => {
        setSchedForm(f => ({
            ...f,
            content_ids: f.content_ids.includes(id) ? f.content_ids.filter(c => c !== id) : [...f.content_ids, id],
        }));
    };

    const addTime = () => setSchedForm(f => ({ ...f, times_of_day: [...f.times_of_day, '12:00'] }));
    const removeTime = (i: number) => setSchedForm(f => ({ ...f, times_of_day: f.times_of_day.filter((_, idx) => idx !== i) }));
    const updateTime = (i: number, val: string) => setSchedForm(f => ({ ...f, times_of_day: f.times_of_day.map((t, idx) => idx === i ? val : t) }));

    const addCaption = () => setSchedForm(f => ({ ...f, caption_templates: [...f.caption_templates, ''] }));
    const removeCaption = (i: number) => setSchedForm(f => ({ ...f, caption_templates: f.caption_templates.filter((_, idx) => idx !== i) }));
    const updateCaption = (i: number, val: string) => setSchedForm(f => ({ ...f, caption_templates: f.caption_templates.map((c, idx) => idx === i ? val : c) }));

    const typeIcon = (type: string) => type === 'image' ? <Image size={14} /> : type === 'video' ? <Video size={14} /> : <FileText size={14} />;
    const modeIcon = (mode: string) => mode === 'random' ? <Shuffle size={14} /> : mode === 'sequence' ? <List size={14} /> : <Play size={14} />;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">WA Status Manager</h1>
                    <p className="page-description">Auto-update status WhatsApp dari berbagai perangkat secara terjadwal</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    {tab === 'library' && <button className="btn btn-secondary" onClick={() => setShowAddCategory(true)}><Tag size={16} /> Kategori Baru</button>}
                    {tab === 'library' && <button className="btn btn-primary" onClick={() => setShowAddContent(true)}><Plus size={16} /> Tambah Konten</button>}
                    {tab === 'schedules' && <button className="btn btn-primary" onClick={() => setShowAddSchedule(true)}><Plus size={16} /> Buat Jadwal</button>}
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--space-6)' }}>
                {([
                    { id: 'library', label: '🖼️ Library Konten', count: contents.length },
                    { id: 'schedules', label: '📅 Jadwal Auto-Post', count: schedules.filter(s => s.is_active).length },
                    { id: 'history', label: '📋 Riwayat', count: null },
                ] as const).map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: 'var(--space-3) var(--space-5)', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t.id ? 'var(--color-accent)' : 'transparent'}`, color: tab === t.id ? 'var(--color-accent)' : 'var(--color-text-muted)', cursor: 'pointer', fontWeight: tab === t.id ? 600 : 400, fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', transition: 'all var(--transition-fast)' }}>
                        {t.label}
                        {t.count !== null && <span className={`badge ${tab === t.id ? 'badge-accent' : 'badge-default'}`}>{t.count}</span>}
                    </button>
                ))}
            </div>

            {/* Error */}
            {error && <div style={{ padding: 'var(--space-3)', background: 'var(--color-danger-soft)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)', display: 'flex', gap: 8, alignItems: 'center' }}><AlertCircle size={16} />{error}<button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }} onClick={() => setError('')}><X size={14} /></button></div>}

            {loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>
                    <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto var(--space-3)' }} />Memuat...
                </div>
            ) : (
                <>
                    {/* ====== LIBRARY TAB ====== */}
                    {tab === 'library' && (
                        <div>
                            {/* Category Filter */}
                            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
                                <button className={`btn btn-sm ${selectedCategory === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSelectedCategory('all')}>
                                    Semua ({contents.length})
                                </button>
                                {categories.map(c => (
                                    <button key={c.id} className={`btn btn-sm ${selectedCategory === c.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSelectedCategory(c.id)} style={{ borderLeft: `3px solid ${c.color}` }}>
                                        {c.icon} {c.name} <span className="badge badge-default" style={{ marginLeft: 4 }}>{c.content_count}</span>
                                    </button>
                                ))}
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-2)' }}>
                                    {['all', 'image', 'video', 'text'].map(t => (
                                        <button key={t} className={`btn btn-sm ${contentTypeFilter === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setContentTypeFilter(t)}>
                                            {t === 'all' ? 'Semua' : t === 'image' ? '🖼️' : t === 'video' ? '🎬' : '📝'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {contents.length === 0 ? (
                                <div className="empty-state">
                                    <Image size={48} className="empty-state-icon" />
                                    <h3 className="empty-state-title">Belum ada konten</h3>
                                    <p className="empty-state-description">Upload gambar, video, atau buat konten teks untuk status WA Anda</p>
                                    <button className="btn btn-primary" onClick={() => setShowAddContent(true)}><Plus size={16} /> Tambah Konten</button>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
                                    {contents.map(c => (
                                        <div key={c.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                            {/* Preview */}
                                            <div style={{ height: 160, background: 'var(--color-bg-tertiary)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {c.type === 'image' && c.content_url ? (
                                                    <img src={c.content_url} alt={c.title || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                                ) : c.type === 'video' ? (
                                                    <Video size={40} style={{ color: 'var(--color-text-muted)', opacity: 0.5 }} />
                                                ) : (
                                                    <div style={{ padding: 'var(--space-4)', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                                                        {(c.caption || '').substring(0, 100) || 'Konten teks'}
                                                    </div>
                                                )}
                                                {/* Type badge */}
                                                <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.6)', color: 'white', borderRadius: 4, padding: '2px 6px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 3 }}>
                                                    {typeIcon(c.type)} {c.type}
                                                </div>
                                                {/* Category badge */}
                                                {c.category && (
                                                    <div style={{ position: 'absolute', top: 8, right: 8, background: c.category.color + 'CC', color: 'white', borderRadius: 4, padding: '2px 6px', fontSize: 10 }}>
                                                        {c.category.icon} {c.category.name}
                                                    </div>
                                                )}
                                                {/* Delete */}
                                                <button onClick={() => deleteContent(c.id)} style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(239,68,68,0.85)', color: 'white', border: 'none', borderRadius: 4, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                            {/* Info */}
                                            <div style={{ padding: 'var(--space-3)' }}>
                                                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{c.title || 'Tanpa judul'}</div>
                                                {c.caption && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>{c.caption}</div>}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-muted)' }}>
                                                    <span>Dipakai: {c.use_count}x</span>
                                                    {c.last_used_at && <span>Terakhir: {new Date(c.last_used_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ====== SCHEDULES TAB ====== */}
                    {tab === 'schedules' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                            {schedules.length === 0 ? (
                                <div className="empty-state">
                                    <Calendar size={48} className="empty-state-icon" />
                                    <h3 className="empty-state-title">Belum ada jadwal</h3>
                                    <p className="empty-state-description">Buat jadwal auto-post status WA untuk setiap perangkat Anda</p>
                                    <button className="btn btn-primary" onClick={() => setShowAddSchedule(true)}><Plus size={16} /> Buat Jadwal Pertama</button>
                                </div>
                            ) : schedules.map(s => (
                                <div key={s.id} className="card" style={{ opacity: s.is_active ? 1 : 0.65 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                                                <span style={{ fontWeight: 700, fontSize: 'var(--text-md)' }}>{s.name}</span>
                                                <span className={`badge ${s.mode === 'random' ? 'badge-accent' : s.mode === 'sequence' ? 'badge-info' : 'badge-default'}`} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                                    {modeIcon(s.mode)} {s.mode === 'random' ? 'Random' : s.mode === 'sequence' ? 'Sequence' : 'Manual'}
                                                </span>
                                                <span className={`badge ${s.is_active ? 'badge-success' : 'badge-default'}`}>{s.is_active ? 'Aktif' : 'Nonaktif'}</span>
                                            </div>

                                            {/* Devices */}
                                            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                📱
                                                {(s.devices && s.devices.length > 0) ? s.devices.map((d: Device) => (
                                                    <span key={d.id} style={{ padding: '1px 8px', borderRadius: 20, background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', fontSize: 'var(--text-xs)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: d.status === 'connected' ? 'var(--color-success)' : 'var(--color-text-muted)' }} />
                                                        {d.name} {d.phone_number ? `(${d.phone_number})` : ''}
                                                    </span>
                                                )) : (
                                                    <span>{s.device?.name || 'Device'} {s.device?.phone_number ? `(${s.device.phone_number})` : ''}</span>
                                                )}
                                            </div>

                                            {/* Times */}
                                            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
                                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>⏰ Jam post:</span>
                                                {s.times_of_day.map(t => (
                                                    <span key={t} className="badge badge-accent" style={{ fontSize: 10 }}>{t}</span>
                                                ))}
                                            </div>

                                            {/* Days */}
                                            <div style={{ display: 'flex', gap: 4, marginBottom: 'var(--space-2)' }}>
                                                {DAY_LABELS.map((d, i) => (
                                                    <span key={i} style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, background: s.days_of_week.includes(i) ? 'var(--color-accent)' : 'var(--color-bg-tertiary)', color: s.days_of_week.includes(i) ? 'white' : 'var(--color-text-muted)' }}>{d}</span>
                                                ))}
                                            </div>

                                            <div style={{ display: 'flex', gap: 'var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                                                <span>🕐 Window: {s.window_start} – {s.window_end}</span>
                                                <span>🔄 Cooldown: {s.cooldown_days} hari</span>
                                                <span>📤 Total dikirim: {s.total_posted}</span>
                                                {s.last_posted_at && <span>⏱️ Terakhir: {new Date(s.last_posted_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0, flexDirection: 'column' }}>
                                            <button className="btn btn-primary btn-sm" onClick={() => postNow(s.id)} disabled={posting === s.id || !(s.devices?.some(d => d.status === 'connected') || s.device?.status === 'connected')} title="Post sekarang">
                                                {posting === s.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Post Sekarang
                                            </button>
                                            <button className={`btn btn-sm ${s.is_active ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => toggleSchedule(s.id, s.is_active)}>
                                                <Power size={14} /> {s.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                                            </button>
                                            <button className="btn btn-sm btn-ghost" onClick={() => duplicateSchedule(s)} title="Duplikat jadwal ke device lain">
                                                <Copy size={14} /> Duplikat
                                            </button>
                                            <button className="btn btn-sm btn-ghost" style={{ color: 'var(--color-danger)' }} onClick={() => deleteSchedule(s.id)} title="Hapus jadwal">
                                                <Trash2 size={14} /> Hapus
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ====== HISTORY TAB ====== */}
                    {tab === 'history' && (
                        <div className="table-wrapper">
                            {logs.length === 0 ? (
                                <div className="empty-state">
                                    <History size={44} className="empty-state-icon" />
                                    <h3 className="empty-state-title">Belum ada riwayat</h3>
                                    <p className="empty-state-description">Riwayat posting status WA akan tampil di sini</p>
                                </div>
                            ) : (
                                <table className="table">
                                    <thead><tr><th>Waktu</th><th>Device</th><th>Konten</th><th>Status</th></tr></thead>
                                    <tbody>
                                        {logs.map(log => (
                                            <tr key={log.id}>
                                                <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{new Date(log.posted_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                                                <td>{log.device?.name || '—'}</td>
                                                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {log.content_id ? 'Konten #' + log.content_id.substring(0, 8) : '—'}
                                                </td>
                                                <td>
                                                    {log.status === 'sent' ? <span className="badge badge-success">✓ Terkirim</span> : log.status === 'failed' ? <span className="badge badge-danger" title={log.error_message || ''}>✗ Gagal</span> : <span className="badge badge-default">Pending</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* ====== ADD CONTENT MODAL ====== */}
            {showAddContent && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}>
                    <div className="card" style={{ width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
                            <h3 style={{ fontSize: 'var(--text-lg)' }}>Tambah Konten</h3>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowAddContent(false)}><X size={16} /></button>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                            {(['image', 'video', 'text'] as const).map(t => (
                                <button key={t} className={`btn btn-sm ${contentForm.type === t ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setContentForm(f => ({ ...f, type: t }))}>
                                    {t === 'image' ? <><Image size={14} /> Gambar</> : t === 'video' ? <><Video size={14} /> Video</> : <><FileText size={14} /> Teks</>}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                            <div className="form-group">
                                <label className="form-label">Judul</label>
                                <input className="form-input" placeholder="Promo Hari Ini" value={contentForm.title} onChange={e => setContentForm(f => ({ ...f, title: e.target.value }))} />
                            </div>
                            {contentForm.type !== 'text' && (
                                <div className="form-group">
                                    <label className="form-label">Upload {contentForm.type === 'image' ? 'Gambar' : 'Video'} *</label>

                                    {/* Drag-drop zone */}
                                    <div
                                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                        onDragLeave={() => setDragOver(false)}
                                        onDrop={handleDrop}
                                        onClick={() => fileInputRef.current?.click()}
                                        style={{
                                            border: `2px dashed ${dragOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
                                            borderRadius: 'var(--radius-md)',
                                            padding: 'var(--space-5)',
                                            textAlign: 'center',
                                            cursor: 'pointer',
                                            background: dragOver ? 'var(--color-accent-soft)' : 'var(--color-bg-tertiary)',
                                            transition: 'all 0.2s',
                                            marginBottom: 'var(--space-2)',
                                        }}
                                    >
                                        {uploading ? (
                                            <div>
                                                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-accent)', margin: '0 auto 8px' }} />
                                                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Mengupload... {uploadProgress}%</p>
                                                <div style={{ height: 4, background: 'var(--color-bg-secondary)', borderRadius: 2, marginTop: 8 }}>
                                                    <div style={{ height: '100%', width: `${uploadProgress}%`, background: 'var(--color-accent)', borderRadius: 2, transition: 'width 0.3s' }} />
                                                </div>
                                            </div>
                                        ) : contentForm.content_url && contentForm.storage_path ? (
                                            <div>
                                                {contentForm.type === 'image'
                                                    ? <img src={contentForm.content_url} alt="preview" style={{ maxHeight: 100, borderRadius: 6, objectFit: 'contain', marginBottom: 8 }} />
                                                    : <Video size={32} style={{ color: 'var(--color-accent)', marginBottom: 8 }} />
                                                }
                                                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)' }}>✅ File terupload — klik untuk ganti</p>
                                            </div>
                                        ) : (
                                            <div>
                                                <Upload size={24} style={{ color: 'var(--color-text-muted)', margin: '0 auto 8px' }} />
                                                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                                                    Drag & drop file ke sini atau <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>klik untuk browse</span>
                                                </p>
                                                <p style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>
                                                    {contentForm.type === 'image' ? 'JPG, PNG, WEBP, GIF' : 'MP4, MOV'} — maks 10MB
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept={contentForm.type === 'image' ? 'image/*' : 'video/mp4,video/quicktime'}
                                        style={{ display: 'none' }}
                                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
                                    />

                                    {/* Or paste URL manually */}
                                    <details style={{ marginTop: 'var(--space-2)' }}>
                                        <summary style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>Atau masukkan URL langsung (Google Drive, dll)</summary>
                                        <input
                                            className="form-input"
                                            style={{ marginTop: 6 }}
                                            placeholder={`https://drive.google.com/uc?export=download&id=...`}
                                            value={contentForm.storage_path ? '' : contentForm.content_url}
                                            onChange={e => setContentForm(f => ({ ...f, content_url: e.target.value, storage_path: '' }))}
                                        />
                                        <span className="form-hint">Format Google Drive: ganti /view ke /uc?export=download&id=FILE_ID</span>
                                    </details>
                                </div>
                            )}
                            <div className="form-group">
                                <label className="form-label">Caption / Teks Status {contentForm.type === 'text' ? '*' : ''}</label>
                                <textarea className="form-textarea" rows={3} placeholder={`Halo! Cek promo kita hari ini 🔥\n\nVariabel: {hari}, {tanggal}, {jam}, {judul}`} value={contentForm.caption} onChange={e => setContentForm(f => ({ ...f, caption: e.target.value }))} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                                <div className="form-group">
                                    <label className="form-label">Kategori</label>
                                    <select className="form-select" value={contentForm.category_id} onChange={e => setContentForm(f => ({ ...f, category_id: e.target.value }))}>
                                        <option value="">Tanpa Kategori</option>
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Tags (pisah koma)</label>
                                    <input className="form-input" placeholder="promo, hari-raya, diskon" value={contentForm.tags} onChange={e => setContentForm(f => ({ ...f, tags: e.target.value }))} />
                                </div>
                            </div>
                            {/* Preview for image */}
                            {contentForm.type === 'image' && contentForm.content_url && (
                                <div style={{ background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', textAlign: 'center' }}>
                                    <img src={contentForm.content_url} alt="preview" style={{ maxHeight: 120, borderRadius: 'var(--radius-md)', objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                </div>
                            )}
                        </div>
                        {error && <div style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--color-danger-soft)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>{error}</div>}
                        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
                            <button className="btn btn-secondary" onClick={() => setShowAddContent(false)}>Batal</button>
                            <button className="btn btn-primary" onClick={handleAddContent} disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Simpan Konten</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ====== ADD CATEGORY MODAL ====== */}
            {showAddCategory && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}>
                    <div className="card" style={{ width: '100%', maxWidth: 420 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
                            <h3 style={{ fontSize: 'var(--text-md)' }}>Kategori Baru</h3>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowAddCategory(false)}><X size={16} /></button>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Nama Kategori *</label>
                            <input className="form-input" placeholder="Promo, Motivasi, Produk, dll" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Icon</label>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
                                {ICONS.map(ic => <button key={ic} type="button" onClick={() => setCatForm(f => ({ ...f, icon: ic }))} style={{ width: 36, height: 36, fontSize: 18, borderRadius: 6, border: `2px solid ${catForm.icon === ic ? 'var(--color-accent)' : 'var(--color-border)'}`, background: catForm.icon === ic ? 'var(--color-accent-soft)' : 'transparent', cursor: 'pointer' }}>{ic}</button>)}
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Warna</label>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {COLORS.map(c => <button key={c} type="button" onClick={() => setCatForm(f => ({ ...f, color: c }))} style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: `3px solid ${catForm.color === c ? 'white' : 'transparent'}`, outline: catForm.color === c ? `2px solid ${c}` : 'none', cursor: 'pointer' }} />)}
                            </div>
                        </div>
                        {/* Preview */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--space-3)', background: catForm.color + '22', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', border: `1px solid ${catForm.color}55` }}>
                            <span style={{ fontSize: 20 }}>{catForm.icon}</span>
                            <span style={{ fontWeight: 600, color: catForm.color }}>{catForm.name || 'Preview Kategori'}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => setShowAddCategory(false)}>Batal</button>
                            <button className="btn btn-primary" onClick={handleAddCategory} disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Tag size={16} />} Simpan</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ====== ADD SCHEDULE MODAL ====== */}
            {showAddSchedule && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)' }}>
                    <div className="card" style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
                            <h3 style={{ fontSize: 'var(--text-lg)' }}>Buat Jadwal Auto-Post</h3>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowAddSchedule(false)}><X size={16} /></button>
                        </div>

                        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="form-label">Nama Jadwal *</label>
                                    <input className="form-input" placeholder="Jadwal Pagi, Promo Harian, dll" value={schedForm.name} onChange={e => setSchedForm(f => ({ ...f, name: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Perangkat WA * <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 400 }}>(bisa pilih lebih dari 1)</span></label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                        {devices.length === 0 ? (
                                            <span className="form-hint" style={{ color: 'var(--color-warning)' }}>Tidak ada device terkoneksi</span>
                                        ) : devices.map(d => (
                                            <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', border: `2px solid ${schedForm.device_ids.includes(d.id) ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer', background: schedForm.device_ids.includes(d.id) ? 'var(--color-accent-soft)' : 'transparent', transition: 'all 0.15s' }}>
                                                <input type="checkbox" checked={schedForm.device_ids.includes(d.id)} onChange={() => toggleDevice(d.id)} style={{ width: 16, height: 16, accentColor: 'var(--color-accent)' }} />
                                                <span style={{ fontSize: 'var(--text-sm)', fontWeight: schedForm.device_ids.includes(d.id) ? 600 : 400 }}>📱 {d.name}</span>
                                                {d.phone_number && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>({d.phone_number})</span>}
                                            </label>
                                        ))}
                                    </div>
                                    {schedForm.device_ids.length > 1 && (
                                        <span className="form-hint" style={{ color: 'var(--color-accent)' }}>✨ {schedForm.device_ids.length} perangkat dipilih — jadwal terpisah akan dibuat untuk setiap perangkat</span>
                                    )}
                                </div>
                            </div>

                            {/* Mode */}
                            <div className="form-group">
                                <label className="form-label">Mode Pemilihan Konten</label>
                                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                    {[
                                        { id: 'random', label: '🎲 Random', desc: 'Acak dari kategori' },
                                        { id: 'sequence', label: '📋 Sequence', desc: 'Berurutan dari kategori' },
                                        { id: 'manual', label: '🤏 Kustom / Manual', desc: 'Pilih konten spesifik' },
                                    ].map(m => (
                                        <div key={m.id} onClick={() => setSchedForm(f => ({ ...f, mode: m.id }))} style={{ flex: 1, padding: 'var(--space-3)', border: `2px solid ${schedForm.mode === m.id ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer', background: schedForm.mode === m.id ? 'var(--color-accent-soft)' : 'transparent' }}>
                                            <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 4 }}>{m.label}</div>
                                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>{m.desc}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Category OR Content Selection */}
                            {schedForm.mode === 'manual' ? (
                                <div className="form-group">
                                    <label className="form-label">Pilih Konten Spesifik ({schedForm.content_ids.length} dipilih)</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 'var(--space-2)', maxHeight: 200, overflowY: 'auto', padding: 'var(--space-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary)' }}>
                                        {contents.length === 0 ? (
                                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Tidak ada konten di library</span>
                                        ) : contents.map(c => (
                                            <label key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', padding: 'var(--space-2)', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: schedForm.content_ids.includes(c.id) ? 'var(--color-accent-soft)' : 'var(--color-bg-primary)', border: `1px solid ${schedForm.content_ids.includes(c.id) ? 'var(--color-accent)' : 'var(--color-border)'}` }}>
                                                <input type="checkbox" checked={schedForm.content_ids.includes(c.id)} onChange={() => toggleContentSelection(c.id)} style={{ marginTop: 2, accentColor: 'var(--color-accent)' }} />
                                                <div style={{ overflow: 'hidden' }}>
                                                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{c.title || 'Tanpa judul'}</div>
                                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                                        {typeIcon(c.type)} {c.type}
                                                    </div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                    {schedForm.content_ids.length === 0 && <span className="form-hint" style={{ color: 'var(--color-warning)' }}>Wajib pilih minimal 1 konten untuk mode Kustom</span>}
                                </div>
                            ) : (
                                <div className="form-group">
                                    <label className="form-label">Kategori Konten (kosong = semua kategori)</label>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {categories.map(c => (
                                            <button key={c.id} type="button" className={`btn btn-sm ${schedForm.category_ids.includes(c.id) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggleCategory(c.id)} style={{ borderLeft: `3px solid ${c.color}` }}>
                                                {c.icon} {c.name}
                                            </button>
                                        ))}
                                        {categories.length === 0 && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Buat kategori dulu di Library</span>}
                                    </div>
                                </div>
                            )}

                            {/* Times */}
                            <div className="form-group">
                                <label className="form-label">Jam Posting</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                    {schedForm.times_of_day.map((t, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                                            <input type="time" className="form-input" value={t} onChange={e => updateTime(i, e.target.value)} style={{ width: 140 }} />
                                            {schedForm.times_of_day.length > 1 && <button type="button" className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => removeTime(i)}><X size={14} /></button>}
                                        </div>
                                    ))}
                                    <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={addTime}><Plus size={14} /> Tambah Jam</button>
                                </div>
                            </div>

                            {/* Days of week */}
                            <div className="form-group">
                                <label className="form-label">Hari Posting</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    {DAY_LABELS.map((d, i) => (
                                        <button key={i} type="button" onClick={() => toggleDay(i)} style={{ width: 38, height: 38, borderRadius: '50%', border: '2px solid', borderColor: schedForm.days_of_week.includes(i) ? 'var(--color-accent)' : 'var(--color-border)', background: schedForm.days_of_week.includes(i) ? 'var(--color-accent)' : 'transparent', color: schedForm.days_of_week.includes(i) ? 'white' : 'var(--color-text-muted)', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>{d}</button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' }}>
                                <div className="form-group">
                                    <label className="form-label">Mulai (Time Window)</label>
                                    <input type="time" className="form-input" value={schedForm.window_start} onChange={e => setSchedForm(f => ({ ...f, window_start: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Selesai</label>
                                    <input type="time" className="form-input" value={schedForm.window_end} onChange={e => setSchedForm(f => ({ ...f, window_end: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Cooldown (hari)</label>
                                    <input type="number" className="form-input" min={0} max={30} value={schedForm.cooldown_days} onChange={e => setSchedForm(f => ({ ...f, cooldown_days: +e.target.value }))} />
                                    <span className="form-hint">Jangka tunggu reuse konten</span>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Template Caption (opsional)</span>
                                    {schedForm.caption_templates.length > 1 && (
                                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent)', fontWeight: 400 }}>
                                            ✨ {schedForm.caption_templates.length} Variasi Caption
                                        </span>
                                    )}
                                </label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                    {schedForm.caption_templates.map((c, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1, position: 'relative' }}>
                                                <textarea 
                                                    className="form-input" 
                                                    style={{ minHeight: 60, paddingRight: 32, resize: 'vertical' }}
                                                    placeholder="Selamat pagi {hari}! — {tanggal} 🌅\n\n{caption}" 
                                                    value={c} 
                                                    onChange={e => updateCaption(i, e.target.value)} 
                                                />
                                                <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 600, userSelect: 'none' }}>
                                                    #{i + 1}
                                                </div>
                                            </div>
                                            {schedForm.caption_templates.length > 1 && (
                                                <button type="button" className="btn btn-ghost btn-icon" style={{ color: 'var(--color-danger)', marginTop: 8 }} onClick={() => removeCaption(i)}>
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={addCaption}>
                                        <Plus size={14} /> Tambah Variasi Caption
                                    </button>
                                </div>
                                <span className="form-hint" style={{ marginTop: 8 }}>Override caption konten. Variabel: {'{sapaan}'}, {'{hari}'}, {'{tanggal}'}, {'{jam}'}, {'{judul}'}, {'{caption}'}</span>
                                <span className="form-hint">Jika mode <b>Random</b>, caption akan diambil acak. Jika mode <b>Kustom / Sequence</b>, caption ditarik berurutan (Round Robin).</span>
                            </div>
                        </div>

                        {error && <div style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--color-danger-soft)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-3)' }}>{error}</div>}
                        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-5)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
                            <button className="btn btn-secondary" onClick={() => setShowAddSchedule(false)}>Batal</button>
                            <button className="btn btn-primary" onClick={handleAddSchedule} disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />} Buat Jadwal</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
