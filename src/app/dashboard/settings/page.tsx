'use client';

import { useState, useEffect } from 'react';
import {
    User, Bell, Globe, Shield, Key, ExternalLink,
    Save, Loader2, CheckCircle, Copy, AlertCircle,
    Users, Plus, Trash2, Power, X
} from 'lucide-react';

interface Profile {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string;
    timezone: string | null;
    language: string | null;
}

interface TeamMember {
    id: string;
    name: string;
    email: string | null;
    role: string;
    is_active: boolean;
}

type SettingsTab = 'profile' | 'team' | 'webhook' | 'notifications';

export default function SettingsPage() {
    const [tab, setTab] = useState<SettingsTab>('profile');
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    // Profile form
    const [fullName, setFullName] = useState('');
    const [timezone, setTimezone] = useState('Asia/Jakarta');
    const [language, setLanguage] = useState('id');

    // Webhook
    const [webhookToken, setWebhookToken] = useState('');
    const [copied, setCopied] = useState(false);

    // Team
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    const [teamLoading, setTeamLoading] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newRole, setNewRole] = useState('agent');
    const [teamSaving, setTeamSaving] = useState(false);
    const [teamError, setTeamError] = useState('');

    useEffect(() => {
        fetch('/api/settings/profile')
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    setProfile(d.data);
                    setFullName(d.data.full_name || '');
                    setTimezone(d.data.timezone || 'Asia/Jakarta');
                    setLanguage(d.data.language || 'id');
                    setWebhookToken(d.data.tenant?.webhook_token || '');
                }
            })
            .finally(() => setLoading(false));
    }, []);

    // Load team members when tab switches to team
    useEffect(() => {
        if (tab === 'team') loadTeam();
    }, [tab]);

    const loadTeam = async () => {
        setTeamLoading(true);
        try {
            const res = await fetch('/api/cs/agents');
            const data = await res.json();
            if (data.success) setTeamMembers(data.data);
        } catch { } finally { setTeamLoading(false); }
    };

    const handleSaveProfile = async () => {
        setSaving(true); setError(''); setSaved(false);
        try {
            const res = await fetch('/api/settings/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_name: fullName, timezone, language }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err: any) { setError(err.message); }
        finally { setSaving(false); }
    };

    const copyWebhookUrl = (path: string) => {
        const url = `${window.location.origin}${path}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleAddMember = async () => {
        if (!newName.trim()) { setTeamError('Nama wajib diisi'); return; }
        setTeamSaving(true); setTeamError('');
        try {
            const res = await fetch('/api/cs/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName, email: newEmail, role: newRole }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setTeamMembers(prev => [...prev, data.data]);
            setNewName(''); setNewEmail(''); setNewRole('agent');
            setShowAddForm(false);
        } catch (err: any) { setTeamError(err.message); }
        finally { setTeamSaving(false); }
    };

    const toggleMemberActive = async (id: string, current: boolean) => {
        try {
            await fetch('/api/cs/agents', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, is_active: !current }),
            });
            setTeamMembers(prev => prev.map(m => m.id === id ? { ...m, is_active: !current } : m));
        } catch { }
    };

    const deleteMember = async (id: string) => {
        if (!confirm('Hapus anggota tim ini?')) return;
        try {
            await fetch('/api/cs/agents', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            setTeamMembers(prev => prev.filter(m => m.id !== id));
        } catch { }
    };

    const TABS = [
        { id: 'profile', label: '👤 Profil', icon: <User size={16} /> },
        { id: 'team', label: '👥 Team', icon: <Users size={16} /> },
        { id: 'webhook', label: '🔗 Webhook', icon: <Globe size={16} /> },
        { id: 'notifications', label: '🔔 Notifikasi', icon: <Bell size={16} /> },
    ] as const;

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Pengaturan</h1>
                    <p className="page-description">Kelola profil dan konfigurasi akun</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 'var(--space-6)' }}>
                {/* Tab Sidebar */}
                <div className="card" style={{ padding: 0, alignSelf: 'start', overflow: 'hidden' }}>
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                                width: '100%', padding: 'var(--space-3) var(--space-4)',
                                background: tab === t.id ? 'var(--color-accent-soft)' : 'transparent',
                                color: tab === t.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                                border: 'none', borderLeft: `3px solid ${tab === t.id ? 'var(--color-accent)' : 'transparent'}`,
                                textAlign: 'left', cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: tab === t.id ? 600 : 400,
                                transition: 'all var(--transition-fast)',
                            }}
                        >
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="card">
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)' }}>
                            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto' }} />
                        </div>
                    ) : (
                        <>
                            {/* Profile Tab */}
                            {tab === 'profile' && (
                                <div>
                                    <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-5)' }}>Informasi Profil</h3>
                                    {error && <div style={{ padding: 'var(--space-3)', background: 'var(--color-danger-soft)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)', display: 'flex', gap: 8 }}><AlertCircle size={16} />{error}</div>}
                                    {saved && <div style={{ padding: 'var(--space-3)', background: 'var(--color-success-soft)', color: 'var(--color-success)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)', display: 'flex', gap: 8 }}><CheckCircle size={16} />Tersimpan!</div>}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                        <div className="form-group">
                                            <label className="form-label">Nama Lengkap</label>
                                            <input className="form-input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nama Anda" />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Email</label>
                                            <input className="form-input" value={profile?.email || ''} disabled style={{ opacity: 0.6 }} />
                                            <span className="form-hint">Email tidak bisa diubah</span>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Timezone</label>
                                            <select className="form-select" value={timezone} onChange={e => setTimezone(e.target.value)}>
                                                <option value="Asia/Jakarta">WIB — Asia/Jakarta (UTC+7)</option>
                                                <option value="Asia/Makassar">WITA — Asia/Makassar (UTC+8)</option>
                                                <option value="Asia/Jayapura">WIT — Asia/Jayapura (UTC+9)</option>
                                                <option value="UTC">UTC</option>
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Bahasa</label>
                                            <select className="form-select" value={language} onChange={e => setLanguage(e.target.value)}>
                                                <option value="id">Bahasa Indonesia</option>
                                                <option value="en">English</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-5)' }}>
                                        <button className="btn btn-primary" onClick={handleSaveProfile} disabled={saving}>
                                            {saving ? <><Loader2 size={16} className="animate-spin" />Menyimpan...</> : <><Save size={16} />Simpan Profil</>}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Team Tab */}
                            {tab === 'team' && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
                                        <div>
                                            <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 4 }}>Kelola Tim</h3>
                                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
                                                Tambah agen customer service untuk menangani percakapan di Multi-CS
                                            </p>
                                        </div>
                                        <button className="btn btn-primary btn-sm" onClick={() => setShowAddForm(true)}>
                                            <Plus size={16} /> Tambah Agen
                                        </button>
                                    </div>

                                    {/* Add Form */}
                                    {showAddForm && (
                                        <div style={{
                                            padding: 'var(--space-4)', marginBottom: 'var(--space-4)',
                                            border: '1px solid var(--color-border-accent)', borderRadius: 'var(--radius-lg)',
                                            background: 'rgba(108,99,255,0.03)',
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                                                <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>✨ Tambah Agen Baru</h4>
                                                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setShowAddForm(false); setTeamError(''); }}>
                                                    <X size={16} />
                                                </button>
                                            </div>
                                            {teamError && (
                                                <div style={{ padding: 'var(--space-2) var(--space-3)', background: 'var(--color-danger-soft)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)', display: 'flex', gap: 6, alignItems: 'center' }}>
                                                    <AlertCircle size={14} />{teamError}
                                                </div>
                                            )}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px', gap: 'var(--space-3)', alignItems: 'end' }}>
                                                <div className="form-group" style={{ marginBottom: 0 }}>
                                                    <label className="form-label">Nama *</label>
                                                    <input className="form-input" placeholder="Nama agen" value={newName} onChange={e => setNewName(e.target.value)} />
                                                </div>
                                                <div className="form-group" style={{ marginBottom: 0 }}>
                                                    <label className="form-label">Email (opsional)</label>
                                                    <input className="form-input" type="email" placeholder="email@example.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
                                                </div>
                                                <div className="form-group" style={{ marginBottom: 0 }}>
                                                    <label className="form-label">Role</label>
                                                    <select className="form-select" value={newRole} onChange={e => setNewRole(e.target.value)}>
                                                        <option value="agent">Agent</option>
                                                        <option value="supervisor">Supervisor</option>
                                                        <option value="admin">Admin</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
                                                <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddForm(false); setTeamError(''); }}>Batal</button>
                                                <button className="btn btn-primary btn-sm" onClick={handleAddMember} disabled={teamSaving}>
                                                    {teamSaving ? <><Loader2 size={14} className="animate-spin" /> Menyimpan...</> : <><CheckCircle size={14} /> Simpan</>}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Team List */}
                                    {teamLoading ? (
                                        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)' }}>
                                            <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto var(--space-2)' }} />Memuat tim...
                                        </div>
                                    ) : teamMembers.length === 0 ? (
                                        <div className="empty-state">
                                            <Users size={40} className="empty-state-icon" />
                                            <h3 className="empty-state-title">Belum ada anggota tim</h3>
                                            <p className="empty-state-description">Tambah agen customer service untuk mulai mengelola percakapan</p>
                                            <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
                                                <Plus size={16} /> Tambah Agen Pertama
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                            {teamMembers.map(member => (
                                                <div key={member.id} style={{
                                                    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                                                    padding: 'var(--space-3) var(--space-4)',
                                                    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                                                    opacity: member.is_active ? 1 : 0.55,
                                                    transition: 'all var(--transition-fast)',
                                                }}>
                                                    <div className="avatar" style={{ width: 36, height: 36, fontSize: 'var(--text-sm)', flexShrink: 0 }}>
                                                        {member.name[0].toUpperCase()}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                                            <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{member.name}</span>
                                                            <span className={`badge ${member.role === 'admin' ? 'badge-accent' : member.role === 'supervisor' ? 'badge-warning' : 'badge-default'}`}>
                                                                {member.role}
                                                            </span>
                                                            <span className={`badge ${member.is_active ? 'badge-success' : 'badge-default'}`}>
                                                                {member.is_active ? 'Aktif' : 'Nonaktif'}
                                                            </span>
                                                        </div>
                                                        {member.email && (
                                                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
                                                                {member.email}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
                                                        <button
                                                            className="btn btn-ghost btn-icon btn-sm"
                                                            onClick={() => toggleMemberActive(member.id, member.is_active)}
                                                            title={member.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                                                            style={{ color: member.is_active ? 'var(--color-success)' : 'var(--color-text-muted)' }}
                                                        >
                                                            <Power size={15} />
                                                        </button>
                                                        <button
                                                            className="btn btn-ghost btn-icon btn-sm"
                                                            onClick={() => deleteMember(member.id)}
                                                            style={{ color: 'var(--color-danger)' }}
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Webhook Tab */}
                            {tab === 'webhook' && (
                                <div>
                                    <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-5)' }}>Konfigurasi Webhook</h3>
                                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-5)' }}>
                                        Daftarkan URL webhook di bawah ini ke WAHA atau Meta Cloud API Anda agar pesan masuk bisa diproses.
                                    </p>
                                    {[
                                        { label: 'WAHA Webhook URL', path: '/api/webhook/waha', desc: 'Untuk perangkat dengan WAHA (unofficial)' },
                                        { label: 'Meta Official Webhook URL', path: '/api/webhook/official', desc: 'Untuk WhatsApp Business Cloud API' },
                                    ].map(w => (
                                        <div key={w.path} style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                <label className="form-label" style={{ margin: 0 }}>{w.label}</label>
                                                <button className="btn btn-sm btn-secondary" onClick={() => copyWebhookUrl(w.path)}>
                                                    <Copy size={13} /> {copied ? 'Tersalin!' : 'Salin'}
                                                </button>
                                            </div>
                                            <code style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent)', display: 'block', wordBreak: 'break-all' }}>
                                                {typeof window !== 'undefined' ? window.location.origin : 'https://your-app.up.railway.app'}{w.path}
                                            </code>
                                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>{w.desc}</p>
                                        </div>
                                    ))}
                                    <div style={{ padding: 'var(--space-4)', background: 'var(--color-info-soft)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 'var(--radius-md)' }}>
                                        <p style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
                                            💡 <strong>Token Verifikasi Meta:</strong> Set <code style={{ fontSize: 10 }}>META_WEBHOOK_VERIFY_TOKEN</code> di environment variables Railway, kemudian gunakan nilai yang sama di Meta Developer Console.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Notifications Tab */}
                            {tab === 'notifications' && (
                                <div>
                                    <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-5)' }}>Preferensi Notifikasi</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                                        {[
                                            { label: 'Pesan masuk baru', desc: 'Notifikasi saat ada pesan WA masuk' },
                                            { label: 'Campaign selesai', desc: 'Notifikasi saat broadcast campaign selesai' },
                                            { label: 'Device terputus', desc: 'Notifikasi saat device WA terputus' },
                                        ].map((item, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                                                <div>
                                                    <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>{item.label}</div>
                                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{item.desc}</div>
                                                </div>
                                                <input type="checkbox" defaultChecked style={{ width: 18, height: 18, cursor: 'pointer' }} />
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-5)' }}>
                                        <button className="btn btn-primary"><Save size={16} /> Simpan Preferensi</button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
