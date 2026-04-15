'use client';

import { useState, useEffect } from 'react';
import {
    ArrowLeft, Save, Loader2, CheckCircle, User,
    Phone, Mail, Globe, MessageSquare, Image, Link2, Key
} from 'lucide-react';

export default function AdminSettingsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [settings, setSettings] = useState<Record<string, string>>({
        platform_name: '',
        owner_name: '',
        owner_email: '',
        owner_phone: '',
        owner_whatsapp: '',
        platform_logo_url: '',
        upgrade_message: '',
        default_bridge_url: '',
        default_bridge_api_secret: '',
    });

    useEffect(() => {
        fetch('/api/admin/settings')
            .then(r => r.json())
            .then(d => {
                if (d.success) setSettings(prev => ({ ...prev, ...d.data }));
            })
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true); setSaved(false);
        try {
            const res = await fetch('/api/admin/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            const data = await res.json();
            if (data.success) {
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            }
        } catch { }
        finally { setSaving(false); }
    };

    const update = (key: string, value: string) => setSettings(prev => ({ ...prev, [key]: value }));

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
        </div>
    );

    return (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: 'var(--space-6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
                <a href="/admin" className="btn btn-ghost btn-icon"><ArrowLeft size={18} /></a>
                <div>
                    <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>Profil Owner & Platform</h1>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Info kontak ini ditampilkan ke pelanggan saat mau upgrade</p>
                </div>
            </div>

            {saved && (
                <div style={{ padding: 'var(--space-3)', background: 'var(--color-success-soft)', color: 'var(--color-success)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)', display: 'flex', gap: 8 }}>
                    <CheckCircle size={16} />Tersimpan!
                </div>
            )}

            {/* Platform Info */}
            <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
                <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <Globe size={18} style={{ color: 'var(--color-accent)' }} /> Informasi Platform
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                    <div className="form-group">
                        <label className="form-label">Nama Platform</label>
                        <input className="form-input" value={settings.platform_name} onChange={e => update('platform_name', e.target.value)} placeholder="GAS Broadcast" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Logo URL (opsional)</label>
                        <input className="form-input" value={settings.platform_logo_url} onChange={e => update('platform_logo_url', e.target.value)} placeholder="https://example.com/logo.png" />
                    </div>
                </div>
            </div>

            {/* Default Bridge Config */}
            <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
                <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <Link2 size={18} style={{ color: '#22c55e' }} /> Default Bridge Config (WA Web)
                </h3>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
                    Config ini otomatis terisi saat user baru mendaftarkan device WA Web (Bridge) pertama kali.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                    <div className="form-group">
                        <label className="form-label">Bridge URL</label>
                        <input className="form-input" value={settings.default_bridge_url} onChange={e => update('default_bridge_url', e.target.value)} placeholder="https://your-bridge.up.railway.app" />
                        <span className="form-hint">URL service bridge Baileys di Railway</span>
                    </div>
                    <div className="form-group">
                        <label className="form-label">API Secret</label>
                        <input className="form-input" type="password" value={settings.default_bridge_api_secret} onChange={e => update('default_bridge_api_secret', e.target.value)} placeholder="gas_smart_broadcast_bridge" />
                        <span className="form-hint">Sama dengan API_SECRET di environment bridge</span>
                    </div>
                </div>
            </div>

            {/* Owner Profile */}
            <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
                <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <User size={18} style={{ color: '#F59E0B' }} /> Profil Owner
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                    <div className="form-group">
                        <label className="form-label">Nama Owner</label>
                        <input className="form-input" value={settings.owner_name} onChange={e => update('owner_name', e.target.value)} placeholder="Nama Anda" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Email</label>
                        <input className="form-input" type="email" value={settings.owner_email} onChange={e => update('owner_email', e.target.value)} placeholder="admin@gasbroadcast.com" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Nomor Telepon</label>
                        <input className="form-input" value={settings.owner_phone} onChange={e => update('owner_phone', e.target.value)} placeholder="08123456789" />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Nomor WhatsApp (untuk kontak upgrade)</label>
                        <input className="form-input" value={settings.owner_whatsapp} onChange={e => update('owner_whatsapp', e.target.value)} placeholder="6281234567890" />
                        <span className="form-hint">Format internasional: 628xxx (tanpa +)</span>
                    </div>
                </div>
            </div>

            {/* Upgrade Message */}
            <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
                <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <MessageSquare size={18} style={{ color: '#22c55e' }} /> Pesan Upgrade
                </h3>
                <div className="form-group">
                    <label className="form-label">Pesan yang ditampilkan ke pelanggan saat klik Upgrade</label>
                    <textarea
                        className="form-textarea"
                        value={settings.upgrade_message}
                        onChange={e => update('upgrade_message', e.target.value)}
                        placeholder="Hubungi kami untuk upgrade paket langganan Anda..."
                        rows={3}
                    />
                </div>
            </div>

            {/* Preview */}
            <div className="card" style={{ marginBottom: 'var(--space-4)', background: 'var(--color-bg-tertiary)' }}>
                <h3 style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)', color: 'var(--color-text-muted)' }}>👁️ PREVIEW KONTAK UPGRADE (seperti yang dilihat pelanggan)</h3>
                <div style={{ padding: 'var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary)' }}>
                    <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>{settings.upgrade_message || 'Hubungi kami untuk upgrade.'}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                        {settings.owner_whatsapp && (
                            <a href={`https://wa.me/${settings.owner_whatsapp}`} target="_blank" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--space-2) var(--space-3)', background: '#22c55e', color: 'white', borderRadius: 'var(--radius-md)', textDecoration: 'none', fontSize: 'var(--text-sm)', fontWeight: 600, width: 'fit-content' }}>
                                <Phone size={14} /> WhatsApp: {settings.owner_whatsapp}
                            </a>
                        )}
                        {settings.owner_email && (
                            <a href={`mailto:${settings.owner_email}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', color: 'var(--color-accent)' }}>
                                <Mail size={14} /> {settings.owner_email}
                            </a>
                        )}
                        {!settings.owner_whatsapp && !settings.owner_email && (
                            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Isi WhatsApp/Email di atas agar tampil di sini</span>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ minWidth: 160 }}>
                    {saving ? <><Loader2 size={16} className="animate-spin" />Menyimpan...</> : <><Save size={16} />Simpan Pengaturan</>}
                </button>
            </div>
        </div>
    );
}
