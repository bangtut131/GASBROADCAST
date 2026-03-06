'use client';

import { useState, useEffect } from 'react';
import {
    User, Bell, Globe, Shield, Key, ExternalLink,
    Save, Loader2, CheckCircle, Copy, AlertCircle
} from 'lucide-react';

interface Profile {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string;
    timezone: string | null;
    language: string | null;
}

type SettingsTab = 'profile' | 'webhook' | 'notifications';

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

    const TABS = [
        { id: 'profile', label: '👤 Profil', icon: <User size={16} /> },
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
