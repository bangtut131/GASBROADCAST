'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Send, Clock, Users, Smartphone, FileText,
    Image, Video, ChevronDown, Plus, X, Loader2, AlertCircle,
    CheckCircle, Info
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

type TargetType = 'group' | 'manual';
type MediaType = 'none' | 'image' | 'video' | 'document';

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
    const [targetType, setTargetType] = useState<TargetType>('group');
    const [selectedGroup, setSelectedGroup] = useState('');
    const [manualPhones, setManualPhones] = useState('');
    const [mediaType, setMediaType] = useState<MediaType>('none');
    const [mediaUrl, setMediaUrl] = useState('');
    const [minDelay, setMinDelay] = useState(3);
    const [maxDelay, setMaxDelay] = useState(8);
    const [scheduledAt, setScheduledAt] = useState('');
    const [sendNow, setSendNow] = useState(true);

    useEffect(() => {
        loadDevices();
        loadGroups();
    }, []);

    const loadDevices = async () => {
        try {
            const res = await fetch('/api/devices');
            const data = await res.json();
            if (data.success) {
                setDevices(data.data.filter((d: Device) => d.status === 'connected'));
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

    const charCount = messageTemplate.length;
    const variables = Array.from(messageTemplate.matchAll(/\{(\w+)\}/g)).map(m => m[1]);
    const uniqueVars = [...new Set(variables)];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { setError('Nama campaign wajib diisi'); return; }
        if (!selectedDevice) { setError('Pilih perangkat WhatsApp'); return; }
        if (!messageTemplate.trim()) { setError('Template pesan wajib diisi'); return; }
        if (targetType === 'group' && !selectedGroup) { setError('Pilih grup kontak'); return; }
        if (targetType === 'manual' && !manualPhones.trim()) { setError('Masukkan nomor telepon'); return; }

        setSaving(true);
        setError('');

        const phones = targetType === 'manual'
            ? manualPhones.split('\n').map(p => p.trim()).filter(Boolean)
            : [];

        try {
            const res = await fetch('/api/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    device_id: selectedDevice,
                    message_template: messageTemplate,
                    target_type: targetType,
                    target_group_id: targetType === 'group' ? selectedGroup : null,
                    target_phones: phones,
                    media_type: mediaType === 'none' ? null : mediaType,
                    media_url: mediaType !== 'none' ? mediaUrl : null,
                    min_delay: minDelay,
                    max_delay: maxDelay,
                    scheduled_at: !sendNow && scheduledAt ? new Date(scheduledAt).toISOString() : null,
                    auto_start: sendNow,
                }),
            });

            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            router.push('/dashboard/broadcast');
        } catch (err: any) {
            setError(err.message);
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
                            <div className="flex gap-2" style={{ marginBottom: 'var(--space-4)' }}>
                                <button type="button" className={`btn ${targetType === 'group' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTargetType('group')}>
                                    <Users size={16} /> Dari Grup
                                </button>
                                <button type="button" className={`btn ${targetType === 'manual' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTargetType('manual')}>
                                    <FileText size={16} /> Input Manual
                                </button>
                            </div>

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
                                <span>Gunakan variabel: <code>&#123;name&#125;</code> nama kontak, <code>&#123;phone&#125;</code> nomor HP. Variabel lain bebas ditentukan.</span>
                            </div>

                            <div className="flex gap-2" style={{ marginBottom: 'var(--space-2)' }}>
                                {['{name}', '{phone}', '{company}'].map(v => (
                                    <button
                                        key={v}
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => setMessageTemplate(t => t + v)}
                                    >
                                        + {v}
                                    </button>
                                ))}
                            </div>

                            <textarea
                                className="form-textarea"
                                placeholder="Halo {name}, kami menawarkan promo spesial untuk Anda..."
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
                                    <div style={{ background: '#128c7e', color: 'white', padding: 'var(--space-3)', borderRadius: messageTemplate ? 'var(--radius-md)' : 'var(--radius-md)', fontSize: 'var(--text-sm)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                        {messageTemplate
                                            ? messageTemplate
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
                                    <span>{targetType === 'group' ? (groups.find(g => g.id === selectedGroup)?.name || 'Belum dipilih') : `${manualPhones.split('\n').filter(p => p.trim()).length} nomor`}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span style={{ color: 'var(--color-text-muted)' }}>Media:</span>
                                    <span>{mediaType === 'none' ? 'Teks saja' : mediaType}</span>
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
