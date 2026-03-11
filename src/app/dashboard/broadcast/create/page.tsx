'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Send, Clock, Users, Smartphone, FileText,
    Image, Video, ChevronDown, Plus, X, Loader2, AlertCircle,
    CheckCircle, Info, Upload, Download, Sparkles, Search
} from 'lucide-react';

interface Device {
    id: string;
    name: string;
    status: string;
    phone_number: string | null;
}

interface ContactGroup {
    id: string;
    name: string;
    member_count?: number;
}

interface ContactItem {
    id: string;
    name: string | null;
    phone: string;
    tags: string[];
}

type TargetType = 'group' | 'manual' | 'contacts' | 'csv';
type MediaType = 'none' | 'image' | 'video' | 'document';

const DEFAULT_GREETINGS = ['Halo', 'Hi', 'Assalamualaikum', 'Selamat pagi', 'Hello', 'Hai'];

export default function CreateBroadcastPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [devices, setDevices] = useState<Device[]>([]);
    const [groups, setGroups] = useState<ContactGroup[]>([]);

    // Form state
    const [name, setName] = useState('');
    const [selectedDevice, setSelectedDevice] = useState('');
    const [messageTemplate, setMessageTemplate] = useState('');
    const [targetType, setTargetType] = useState<TargetType>('contacts');
    const [selectedGroup, setSelectedGroup] = useState('');
    const [manualPhones, setManualPhones] = useState('');
    const [mediaType, setMediaType] = useState<MediaType>('none');
    const [mediaUrl, setMediaUrl] = useState('');
    const [minDelay, setMinDelay] = useState(3);
    const [maxDelay, setMaxDelay] = useState(8);
    const [scheduledAt, setScheduledAt] = useState('');
    const [sendNow, setSendNow] = useState(true);

    // Contacts target
    const [allContacts, setAllContacts] = useState<ContactItem[]>([]);
    const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
    const [contactSearch, setContactSearch] = useState('');
    const [contactTagFilter, setContactTagFilter] = useState('');
    const [loadingContacts, setLoadingContacts] = useState(false);

    // CSV target
    const csvInputRef = useRef<HTMLInputElement>(null);
    const [csvPhones, setCsvPhones] = useState<{ phone: string; name?: string }[]>([]);
    const [csvFileName, setCsvFileName] = useState('');

    // Random greeting
    const [useGreeting, setUseGreeting] = useState(false);
    const [greetings, setGreetings] = useState<string[]>([...DEFAULT_GREETINGS]);
    const [newGreeting, setNewGreeting] = useState('');

    useEffect(() => {
        loadDevices();
        loadGroups();
    }, []);

    useEffect(() => {
        if (targetType === 'contacts' && allContacts.length === 0) loadContacts();
    }, [targetType]);

    const loadDevices = async () => {
        try {
            const res = await fetch('/api/devices');
            const data = await res.json();
            if (data.success) {
                const connected = data.data.filter((d: Device) => d.status === 'connected');
                setDevices(connected);
                // Auto-select first connected device (default)
                if (connected.length > 0 && !selectedDevice) {
                    setSelectedDevice(connected[0].id);
                }
            }
        } catch { }
    };

    const loadGroups = async () => {
        try {
            const res = await fetch('/api/contacts/groups');
            const data = await res.json();
            if (data.success) setGroups(data.data);
        } catch { }
    };

    const loadContacts = async () => {
        setLoadingContacts(true);
        try {
            const res = await fetch('/api/contacts?limit=2000');
            const data = await res.json();
            if (data.success) setAllContacts(data.data || []);
        } catch { }
        finally { setLoadingContacts(false); }
    };

    const charCount = messageTemplate.length;
    const variables = Array.from(messageTemplate.matchAll(/\{(\w+)\}/g)).map(m => m[1]);
    const uniqueVars = [...new Set(variables)];

    // Get filtered contacts
    const filteredContacts = allContacts.filter(c => {
        const matchSearch = !contactSearch ||
            (c.name || '').toLowerCase().includes(contactSearch.toLowerCase()) ||
            c.phone.includes(contactSearch);
        const matchTag = !contactTagFilter || (c.tags || []).includes(contactTagFilter);
        return matchSearch && matchTag;
    });

    const allTags = [...new Set(allContacts.flatMap(c => c.tags || []))];

    const toggleContact = (phone: string) => {
        setSelectedContacts(prev => {
            const next = new Set(prev);
            if (next.has(phone)) next.delete(phone);
            else next.add(phone);
            return next;
        });
    };

    const selectAllFiltered = () => {
        setSelectedContacts(prev => {
            const next = new Set(prev);
            filteredContacts.forEach(c => next.add(c.phone));
            return next;
        });
    };

    const deselectAll = () => setSelectedContacts(new Set());

    // CSV parsing
    const handleCSVUpload = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length < 2) { setError('File CSV kosong atau hanya header'); return; }

            const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
            const phoneIdx = header.findIndex(h => ['phone', 'nomor', 'telepon', 'no', 'whatsapp', 'wa'].includes(h));
            const nameIdx = header.findIndex(h => ['name', 'nama'].includes(h));

            if (phoneIdx === -1) { setError('Kolom "phone" tidak ditemukan. Header: ' + header.join(', ')); return; }

            const parsed: { phone: string; name?: string }[] = [];
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].match(/("([^"]*)"|[^,]*)/g)?.map(c => c.trim().replace(/^"|"$/g, '')) || [];
                let phone = (cols[phoneIdx] || '').replace(/\D/g, '');
                if (phone.startsWith('08')) phone = '62' + phone.slice(1);
                else if (phone.startsWith('0')) phone = '62' + phone.slice(1);
                if (!phone || phone.length < 10) continue;
                parsed.push({ phone, name: nameIdx >= 0 ? cols[nameIdx] : undefined });
            }

            setCsvPhones(parsed);
            setCsvFileName(file.name);
            setError('');
        };
        reader.readAsText(file);
    };

    const downloadCSVTemplate = () => {
        const csv = 'phone,name\n6281234567890,John Doe\n6289876543210,Jane Smith\n08123456789,Budi Pratama';
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'template_broadcast.csv'; a.click();
        URL.revokeObjectURL(url);
    };

    const addGreeting = () => {
        if (newGreeting.trim() && !greetings.includes(newGreeting.trim())) {
            setGreetings(prev => [...prev, newGreeting.trim()]);
            setNewGreeting('');
        }
    };

    const removeGreeting = (g: string) => setGreetings(prev => prev.filter(x => x !== g));

    // Build target phones from the selected target type
    const getTargetPhones = (): string[] => {
        if (targetType === 'manual') return manualPhones.split('\n').map(p => p.trim()).filter(Boolean);
        if (targetType === 'contacts') return Array.from(selectedContacts);
        if (targetType === 'csv') return csvPhones.map(c => c.phone);
        return [];
    };

    const getTargetCount = (): number => {
        if (targetType === 'group') return groups.find(g => g.id === selectedGroup)?.member_count || 0;
        return getTargetPhones().length;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { setError('Nama campaign wajib diisi'); return; }
        if (!selectedDevice) { setError('Pilih perangkat WhatsApp'); return; }
        if (!messageTemplate.trim()) { setError('Template pesan wajib diisi'); return; }
        if (targetType === 'group' && !selectedGroup) { setError('Pilih grup kontak'); return; }
        if (targetType === 'manual' && !manualPhones.trim()) { setError('Masukkan nomor telepon'); return; }
        if (targetType === 'contacts' && selectedContacts.size === 0) { setError('Pilih minimal 1 kontak'); return; }
        if (targetType === 'csv' && csvPhones.length === 0) { setError('Upload file CSV terlebih dahulu'); return; }

        setSaving(true);
        setError('');

        const phones = getTargetPhones();

        try {
            const res = await fetch('/api/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    device_id: selectedDevice,
                    message_template: messageTemplate,
                    target_type: targetType === 'contacts' || targetType === 'csv' ? 'manual' : targetType,
                    target_group_id: targetType === 'group' ? selectedGroup : null,
                    target_phones: phones,
                    media_type: mediaType === 'none' ? null : mediaType,
                    media_url: mediaType !== 'none' ? mediaUrl : null,
                    min_delay: minDelay,
                    max_delay: maxDelay,
                    scheduled_at: !sendNow && scheduledAt ? new Date(scheduledAt).toISOString() : null,
                    auto_start: sendNow,
                    greetings: useGreeting ? greetings : null,
                }),
            });

            const data = await res.json();
            if (!data.success) throw new Error(data.error);

            // Trigger broadcast execution from client-side (reliable, unlike server fire-and-forget)
            if (sendNow && data.data?.id) {
                fetch(`/api/campaigns/${data.data.id}/run`, { method: 'POST' })
                    .catch(err => console.error('Run trigger failed:', err));
            }

            router.push('/dashboard/broadcast');
        } catch (err: any) {
            setError(err.message || 'Terjadi kesalahan');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <div className="page-header">
                <div className="flex items-center gap-3">
                    <a href="/dashboard/broadcast" className="btn btn-ghost btn-icon">
                        <ArrowLeft size={18} />
                    </a>
                    <div>
                        <h1 className="page-title">Buat Broadcast Baru</h1>
                        <p className="page-description">Kirim pesan ke banyak kontak sekaligus</p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 'var(--space-6)', alignItems: 'start' }}>
                    {/* LEFT: Form */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                        {error && (
                            <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-danger-soft)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 'var(--text-sm)', display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                                <AlertCircle size={16} /> {error}
                            </div>
                        )}

                        {/* Basic Info */}
                        <div className="card">
                            <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)' }}>📋 Informasi Campaign</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                                <div className="form-group">
                                    <label className="form-label">Nama Campaign *</label>
                                    <input type="text" className="form-input" placeholder="Campaign Promo Lebaran 2025" value={name} onChange={e => setName(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Perangkat WhatsApp *</label>
                                    <select className="form-select" value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)}>
                                        <option value="">-- Pilih Device --</option>
                                        {devices.map(d => (
                                            <option key={d.id} value={d.id}>{d.name} {d.phone_number ? `(${d.phone_number})` : ''}</option>
                                        ))}
                                    </select>
                                    {devices.length === 0 && (
                                        <span className="form-hint" style={{ color: 'var(--color-warning)' }}>
                                            ⚠️ Belum ada device terkoneksi. <a href="/dashboard/devices/connect">Hubungkan dulu →</a>
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Target Contacts */}
                        <div className="card">
                            <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)' }}>🎯 Target Penerima</h3>
                            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
                                <button type="button" className={`btn btn-sm ${targetType === 'contacts' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTargetType('contacts')}>
                                    <Users size={14} /> Dari Kontak
                                </button>
                                <button type="button" className={`btn btn-sm ${targetType === 'group' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTargetType('group')}>
                                    <Users size={14} /> Dari Grup
                                </button>
                                <button type="button" className={`btn btn-sm ${targetType === 'csv' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTargetType('csv')}>
                                    <Upload size={14} /> Upload CSV
                                </button>
                                <button type="button" className={`btn btn-sm ${targetType === 'manual' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTargetType('manual')}>
                                    <FileText size={14} /> Input Manual
                                </button>
                            </div>

                            {/* Contacts target */}
                            {targetType === 'contacts' && (
                                <div>
                                    {loadingContacts ? (
                                        <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--color-text-muted)' }}>
                                            <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} /> Memuat kontak...
                                        </div>
                                    ) : (
                                        <>
                                            {/* Search + tag filter */}
                                            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
                                                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                                                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                                                    <input className="form-input" placeholder="Cari nama/nomor..." value={contactSearch} onChange={e => setContactSearch(e.target.value)} style={{ paddingLeft: 32, height: 36, fontSize: 'var(--text-sm)' }} />
                                                </div>
                                                <select className="form-select" value={contactTagFilter} onChange={e => setContactTagFilter(e.target.value)} style={{ height: 36, minWidth: 120, fontSize: 'var(--text-sm)' }}>
                                                    <option value="">Semua Tag</option>
                                                    {allTags.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                                <button type="button" className="btn btn-secondary btn-sm" onClick={selectAllFiltered}>✓ Pilih Semua</button>
                                                {selectedContacts.size > 0 && (
                                                    <button type="button" className="btn btn-ghost btn-sm" onClick={deselectAll} style={{ color: 'var(--color-danger)' }}>Hapus Pilihan</button>
                                                )}
                                            </div>
                                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent)', marginBottom: 'var(--space-2)', fontWeight: 600 }}>
                                                ✅ {selectedContacts.size} kontak dipilih dari {allContacts.length} total
                                            </div>

                                            {/* Contact list */}
                                            <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                                                {filteredContacts.length === 0 ? (
                                                    <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                                                        Tidak ada kontak ditemukan
                                                    </div>
                                                ) : filteredContacts.map(c => (
                                                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: selectedContacts.has(c.phone) ? 'var(--color-accent-soft)' : 'transparent', transition: 'background 0.15s' }}>
                                                        <input type="checkbox" checked={selectedContacts.has(c.phone)} onChange={() => toggleContact(c.phone)} style={{ width: 16, height: 16, accentColor: 'var(--color-accent)' }} />
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: 'var(--text-sm)', fontWeight: selectedContacts.has(c.phone) ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || 'Tanpa nama'}</div>
                                                            <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{c.phone}</div>
                                                        </div>
                                                        {c.tags?.length > 0 && (
                                                            <div style={{ display: 'flex', gap: 2 }}>
                                                                {c.tags.slice(0, 2).map(t => <span key={t} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>{t}</span>)}
                                                            </div>
                                                        )}
                                                    </label>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Group target */}
                            {targetType === 'group' && (
                                <div className="form-group">
                                    <label className="form-label">Pilih Grup Kontak *</label>
                                    <select className="form-select" value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
                                        <option value="">-- Pilih Grup --</option>
                                        {groups.map(g => (
                                            <option key={g.id} value={g.id}>{g.name} {g.member_count ? `(${g.member_count} kontak)` : ''}</option>
                                        ))}
                                    </select>
                                    {groups.length === 0 && (
                                        <span className="form-hint">Belum ada grup. <a href="/dashboard/contacts">Buat grup →</a></span>
                                    )}
                                </div>
                            )}

                            {/* CSV target */}
                            {targetType === 'csv' && (
                                <div>
                                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                                        <button type="button" className="btn btn-ghost btn-sm" onClick={downloadCSVTemplate}>
                                            <Download size={14} /> Download Template
                                        </button>
                                    </div>
                                    <input ref={csvInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleCSVUpload(f); }} />
                                    <div
                                        onClick={() => csvInputRef.current?.click()}
                                        style={{
                                            border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-md)',
                                            padding: 'var(--space-5)', textAlign: 'center', cursor: 'pointer',
                                            background: 'var(--color-bg-tertiary)', transition: 'all 0.2s'
                                        }}
                                    >
                                        {csvPhones.length > 0 ? (
                                            <div>
                                                <CheckCircle size={24} style={{ color: 'var(--color-success)', margin: '0 auto 8px' }} />
                                                <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-success)' }}>
                                                    ✅ {csvPhones.length} nomor dari {csvFileName}
                                                </p>
                                                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>Klik untuk ganti file</p>
                                            </div>
                                        ) : (
                                            <div>
                                                <Upload size={24} style={{ color: 'var(--color-text-muted)', margin: '0 auto 8px' }} />
                                                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                                                    Klik untuk upload file CSV
                                                </p>
                                                <p style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>
                                                    Format: kolom "phone" wajib, "name" opsional
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Manual target */}
                            {targetType === 'manual' && (
                                <div className="form-group">
                                    <label className="form-label">Nomor Telepon (1 per baris) *</label>
                                    <textarea
                                        className="form-textarea"
                                        placeholder={'628123456789\n628987654321\n628111222333'}
                                        value={manualPhones}
                                        onChange={e => setManualPhones(e.target.value)}
                                        rows={6}
                                    />
                                    <span className="form-hint">
                                        {manualPhones.split('\n').filter(p => p.trim()).length} nomor dimasukkan. Format: 628xxx atau 08xxx (otomatis dikonversi)
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Message Template */}
                        <div className="card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                                <h3 style={{ fontSize: 'var(--text-md)' }}>✏️ Template Pesan</h3>
                                <span style={{ fontSize: 'var(--text-xs)', color: charCount > 1000 ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
                                    {charCount} karakter
                                </span>
                            </div>

                            <div className="info-box" style={{ marginBottom: 'var(--space-3)' }}>
                                <Info size={14} style={{ flexShrink: 0, color: 'var(--color-info)' }} />
                                <span>Variabel: <code>&#123;name&#125;</code> nama kontak, <code>&#123;phone&#125;</code> nomor HP{useGreeting && <>, <code>&#123;greeting&#125;</code> sapaan acak</>}. Variabel lain bebas ditentukan.</span>
                            </div>

                            <div className="flex gap-2" style={{ marginBottom: 'var(--space-2)', flexWrap: 'wrap' }}>
                                {['{name}', '{phone}', '{company}', ...(useGreeting ? ['{greeting}'] : [])].map(v => (
                                    <button
                                        key={v}
                                        type="button"
                                        className={`btn btn-sm ${v === '{greeting}' ? 'btn-accent' : 'btn-secondary'}`}
                                        onClick={() => setMessageTemplate(t => t + v)}
                                        style={v === '{greeting}' ? { background: 'linear-gradient(135deg, #6C63FF, #EC4899)', color: 'white', border: 'none' } : {}}
                                    >
                                        + {v}
                                    </button>
                                ))}
                            </div>

                            <textarea
                                className="form-textarea"
                                placeholder={useGreeting ? "{greeting} {name}, kami menawarkan promo spesial untuk Anda..." : "Halo {name}, kami menawarkan promo spesial untuk Anda..."}
                                value={messageTemplate}
                                onChange={e => setMessageTemplate(e.target.value)}
                                rows={6}
                            />

                            {uniqueVars.length > 0 && (
                                <div style={{ marginTop: 'var(--space-2)' }}>
                                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Variabel terdeteksi: </span>
                                    {uniqueVars.map(v => <span key={v} className="badge badge-accent" style={{ marginLeft: 4 }}>{'{' + v + '}'}</span>)}
                                </div>
                            )}
                        </div>

                        {/* Random Greeting */}
                        <div className="card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                    <Sparkles size={16} style={{ color: 'var(--color-accent)' }} />
                                    <h3 style={{ fontSize: 'var(--text-md)' }}>Random Greeting</h3>
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
                                    <input
                                        type="checkbox"
                                        checked={useGreeting}
                                        onChange={e => setUseGreeting(e.target.checked)}
                                        style={{ width: 16, height: 16, accentColor: 'var(--color-accent)' }}
                                    />
                                    Aktifkan
                                </label>
                            </div>

                            {useGreeting && (
                                <>
                                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
                                        Gunakan <code style={{ background: 'var(--color-bg-tertiary)', padding: '1px 5px', borderRadius: 4, color: 'var(--color-accent)' }}>{'{'+'greeting'+'}'}</code> di template pesan. Saat kirim, sapaan akan dipilih acak.
                                    </p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                                        {greetings.map(g => (
                                            <span key={g} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, background: 'var(--color-accent-soft)', border: '1px solid var(--color-accent)', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-accent)' }}>
                                                {g}
                                                <button type="button" onClick={() => removeGreeting(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 0, lineHeight: 1 }}>
                                                    <X size={12} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                        <input
                                            className="form-input"
                                            placeholder="Tambah sapaan baru..."
                                            value={newGreeting}
                                            onChange={e => setNewGreeting(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGreeting(); } }}
                                            style={{ flex: 1, height: 34, fontSize: 'var(--text-sm)' }}
                                        />
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={addGreeting} disabled={!newGreeting.trim()}>
                                            <Plus size={14} /> Tambah
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Media */}
                        <div className="card">
                            <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)' }}>🖼️ Media (Opsional)</h3>
                            <div className="flex gap-2" style={{ marginBottom: 'var(--space-4)' }}>
                                {(['none', 'image', 'video', 'document'] as MediaType[]).map(type => (
                                    <button
                                        key={type}
                                        type="button"
                                        className={`btn btn-sm ${mediaType === type ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => setMediaType(type)}
                                    >
                                        {type === 'none' ? 'Teks Saja' : type === 'image' ? '🖼️ Gambar' : type === 'video' ? '🎥 Video' : '📄 Dokumen'}
                                    </button>
                                ))}
                            </div>
                            {mediaType !== 'none' && (
                                <div className="form-group">
                                    <label className="form-label">URL {mediaType} *</label>
                                    <input
                                        type="url"
                                        className="form-input"
                                        placeholder={`https://example.com/file.${mediaType === 'image' ? 'jpg' : mediaType === 'video' ? 'mp4' : 'pdf'}`}
                                        value={mediaUrl}
                                        onChange={e => setMediaUrl(e.target.value)}
                                    />
                                    <span className="form-hint">URL harus bisa diakses publik oleh WhatsApp</span>
                                </div>
                            )}
                        </div>

                        {/* Send Settings */}
                        <div className="card">
                            <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)' }}>⚙️ Pengaturan Pengiriman</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                <div className="form-group">
                                    <label className="form-label">Delay Min (detik)</label>
                                    <input type="number" className="form-input" min={1} max={60} value={minDelay} onChange={e => setMinDelay(+e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Delay Max (detik)</label>
                                    <input type="number" className="form-input" min={1} max={120} value={maxDelay} onChange={e => setMaxDelay(+e.target.value)} />
                                </div>
                            </div>
                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-2)' }}>
                                Delay acak antara {minDelay}-{maxDelay} detik per pesan untuk menghindari pemblokiran
                            </p>

                            <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
                                <div className="flex gap-3" style={{ marginBottom: 'var(--space-3)' }}>
                                    <button type="button" className={`btn btn-sm ${sendNow ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSendNow(true)}>
                                        <Send size={14} /> Kirim Sekarang
                                    </button>
                                    <button type="button" className={`btn btn-sm ${!sendNow ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSendNow(false)}>
                                        <Clock size={14} /> Jadwalkan
                                    </button>
                                </div>
                                {!sendNow && (
                                    <div className="form-group">
                                        <label className="form-label">Waktu Pengiriman</label>
                                        <input
                                            type="datetime-local"
                                            className="form-input"
                                            value={scheduledAt}
                                            onChange={e => setScheduledAt(e.target.value)}
                                            min={new Date().toISOString().slice(0, 16)}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: Preview */}
                    <div style={{ position: 'sticky', top: 'var(--space-6)' }}>
                        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
                            <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)' }}>📱 Preview Pesan</h3>
                            <div style={{ background: '#0b1219', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', minHeight: 200 }}>
                                {/* WA chat bubble */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxWidth: '85%' }}>
                                    {mediaType === 'image' && mediaUrl && (
                                        <div style={{ background: '#128c7e', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 'var(--text-sm)' }}>
                                            <Image size={24} />
                                        </div>
                                    )}
                                    <div style={{ background: '#128c7e', color: 'white', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                        {messageTemplate
                                            ? messageTemplate
                                                .replace(/{greeting}/gi, useGreeting && greetings.length > 0 ? greetings[Math.floor(Math.random() * greetings.length)] : 'Halo')
                                                .replace(/{name}/gi, 'Budi Santoso')
                                                .replace(/{phone}/gi, '628123456789')
                                            : <span style={{ opacity: 0.6, fontStyle: 'italic' }}>Preview pesan akan tampil di sini...</span>
                                        }
                                    </div>
                                    <div style={{ fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.5)', textAlign: 'right' }}>
                                        {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} ✓✓
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Summary */}
                        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
                            <h3 style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)', color: 'var(--color-text-muted)' }}>RINGKASAN</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                                <div className="flex justify-between">
                                    <span style={{ color: 'var(--color-text-muted)' }}>Device:</span>
                                    <span>{devices.find(d => d.id === selectedDevice)?.name || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span style={{ color: 'var(--color-text-muted)' }}>Target:</span>
                                    <span>
                                        {targetType === 'contacts' && `${selectedContacts.size} kontak`}
                                        {targetType === 'group' && (groups.find(g => g.id === selectedGroup)?.name || 'Belum dipilih')}
                                        {targetType === 'csv' && `${csvPhones.length} nomor (CSV)`}
                                        {targetType === 'manual' && `${manualPhones.split('\n').filter(p => p.trim()).length} nomor`}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span style={{ color: 'var(--color-text-muted)' }}>Media:</span>
                                    <span>{mediaType === 'none' ? 'Teks saja' : mediaType}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span style={{ color: 'var(--color-text-muted)' }}>Greeting:</span>
                                    <span>{useGreeting ? `${greetings.length} sapaan` : 'Mati'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span style={{ color: 'var(--color-text-muted)' }}>Delay:</span>
                                    <span>{minDelay}-{maxDelay} detik</span>
                                </div>
                                <div className="flex justify-between">
                                    <span style={{ color: 'var(--color-text-muted)' }}>Jadwal:</span>
                                    <span>{sendNow ? 'Langsung' : scheduledAt || 'Belum diatur'}</span>
                                </div>
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary" style={{ width: '100%', height: 48 }} disabled={saving}>
                            {saving ? <><Loader2 size={18} className="animate-spin" /> Menyimpan...</> : sendNow ? <><Send size={18} /> Mulai Broadcast</> : <><Clock size={18} /> Jadwalkan Broadcast</>}
                        </button>
                    </div>
                </div>
            </form>

            <style jsx>{`
        .info-box {
          display: flex;
          align-items: flex-start;
          gap: var(--space-2);
          padding: var(--space-3);
          background: var(--color-info-soft);
          border: 1px solid rgba(59, 130, 246, 0.2);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
        }
        .info-box code {
          background: var(--color-bg-tertiary);
          padding: 1px 5px;
          border-radius: var(--radius-sm);
          font-family: monospace;
          font-size: var(--text-xs);
          color: var(--color-accent);
        }
      `}</style>
        </div>
    );
}
