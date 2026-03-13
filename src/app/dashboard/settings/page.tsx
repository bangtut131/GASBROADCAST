'use client';

import { useState, useEffect } from 'react';
import {
    User, Bell, Globe, Shield, Key, ExternalLink,
    Save, Loader2, CheckCircle, Copy, AlertCircle,
    Users, Plus, Trash2, Power, X, CreditCard, Sparkles,
    Zap, Crown, Check, Phone, Mail
} from 'lucide-react';

interface Profile {
    id: string;
    full_name: string | null;
    email: string | null;
    role: string;
    timezone: string | null;
    language: string | null;
    tenant?: {
        id: string;
        name: string;
        plan: string;
        settings: Record<string, any>;
        webhook_token: string;
    };
}

interface TeamMember {
    id: string;
    name: string;
    email: string | null;
    role: string;
    is_active: boolean;
    assigned_devices?: string[];
}

type SettingsTab = 'profile' | 'subscription' | 'team' | 'webhook' | 'notifications';

const PLAN_LIMITS: Record<string, { devices: number; broadcasts: number; contacts: number; status_schedules: number; team_members: number; price: string; priceNum: number }> = {
    free: { devices: 1, broadcasts: 5, contacts: 500, status_schedules: 2, team_members: 1, price: 'Gratis', priceNum: 0 },
    starter: { devices: 3, broadcasts: 50, contacts: 5000, status_schedules: 10, team_members: 3, price: 'Rp 99.000/bln', priceNum: 99000 },
    pro: { devices: 10, broadcasts: -1, contacts: 50000, status_schedules: -1, team_members: 10, price: 'Rp 299.000/bln', priceNum: 299000 },
    enterprise: { devices: -1, broadcasts: -1, contacts: -1, status_schedules: -1, team_members: -1, price: 'Custom', priceNum: 0 },
};

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
    const [newAssignedDevices, setNewAssignedDevices] = useState<string[]>([]);
    const [teamSaving, setTeamSaving] = useState(false);
    const [teamError, setTeamError] = useState('');
    const [devices, setDevices] = useState<any[]>([]);

    // Notifications
    const [notifPrefs, setNotifPrefs] = useState({
        new_message: true,
        campaign_complete: true,
        device_disconnect: true,
    });
    const [notifSaving, setNotifSaving] = useState(false);
    const [notifSaved, setNotifSaved] = useState(false);

    // Platform settings (for upgrade contact)
    const [platformSettings, setPlatformSettings] = useState<Record<string, string>>({});
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [upgradeTarget, setUpgradeTarget] = useState('');

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
                    // Load notification prefs from tenant settings
                    const savedNotifs = d.data.tenant?.settings?.notifications;
                    if (savedNotifs) {
                        setNotifPrefs(prev => ({ ...prev, ...savedNotifs }));
                    }
                }
            })
            .finally(() => setLoading(false));

        // Fetch platform settings for upgrade contact
        fetch('/api/admin/settings')
            .then(r => r.json())
            .then(d => { if (d.success) setPlatformSettings(d.data); })
            .catch(() => {});

        // Fetch user's devices for team assignment
        fetch('/api/devices')
            .then(r => r.json())
            .then(d => { if (d.success) setDevices(d.data); })
            .catch(() => {});
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
                body: JSON.stringify({ name: newName, email: newEmail, role: newRole, assigned_devices: newAssignedDevices }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setTeamMembers(prev => [...prev, data.data]);
            setNewName(''); setNewEmail(''); setNewRole('agent'); setNewAssignedDevices([]);
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

    const handleSaveNotifications = async () => {
        setNotifSaving(true); setNotifSaved(false);
        try {
            const res = await fetch('/api/settings/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notifications: notifPrefs }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setNotifSaved(true);
            setTimeout(() => setNotifSaved(false), 3000);
        } catch (err: any) { alert('Gagal menyimpan: ' + err.message); }
        finally { setNotifSaving(false); }
    };

    const currentPlan = (profile?.tenant?.plan || 'free').toLowerCase();
    const currentLimits = PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free;

    const TABS = [
        { id: 'profile', label: '👤 Profil', icon: <User size={16} /> },
        { id: 'subscription', label: '💎 Langganan', icon: <CreditCard size={16} /> },
        // Show Team only if plan is NOT free
        ...(currentPlan !== 'free' ? [{ id: 'team', label: '👥 Team', icon: <Users size={16} /> } as const] : []),
        // Show Webhook & Notifications only if plan is pro or enterprise
        ...(currentPlan === 'pro' || currentPlan === 'enterprise' ? [
            { id: 'webhook', label: '🔗 Webhook', icon: <Globe size={16} /> } as const,
            { id: 'notifications', label: '🔔 Notifikasi', icon: <Bell size={16} /> } as const
        ] : []),
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

                            {/* Subscription Tab */}
                            {tab === 'subscription' && (
                                <div>
                                    <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-5)' }}>Langganan & Paket</h3>

                                    {/* Current Plan */}
                                    <div style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', border: '2px solid var(--color-accent)', background: 'var(--color-accent-soft)', marginBottom: 'var(--space-6)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 4 }}>
                                                    {currentPlan === 'free' ? <Zap size={18} style={{ color: 'var(--color-accent)' }} /> :
                                                     currentPlan === 'pro' ? <Crown size={18} style={{ color: '#F59E0B' }} /> :
                                                     <Sparkles size={18} style={{ color: 'var(--color-accent)' }} />}
                                                    <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, textTransform: 'capitalize' }}>{currentPlan} Plan</span>
                                                </div>
                                                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{currentLimits.price}</span>
                                            </div>
                                            <span className={`badge ${currentPlan === 'free' ? 'badge-default' : 'badge-success'}`} style={{ fontSize: 'var(--text-sm)', padding: '6px 16px' }}>
                                                {currentPlan === 'free' ? 'Paket Gratis' : 'Aktif'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Plan Limits */}
                                    <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-3)', color: 'var(--color-text-muted)' }}>BATAS PAKET ANDA</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
                                        {[
                                            { label: 'Perangkat WA', value: currentLimits.devices, icon: '📱' },
                                            { label: 'Broadcast/bln', value: currentLimits.broadcasts, icon: '📤' },
                                            { label: 'Kontak', value: currentLimits.contacts, icon: '👥' },
                                            { label: 'Jadwal Status', value: currentLimits.status_schedules, icon: '📅' },
                                            { label: 'Anggota Tim', value: currentLimits.team_members, icon: '🧑‍💼' },
                                        ].map(item => (
                                            <div key={item.label} style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                                <span style={{ fontSize: 20 }}>{item.icon}</span>
                                                <div>
                                                    <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>{item.value === -1 ? '∞' : item.value.toLocaleString()}</div>
                                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{item.label}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Plan Comparison */}
                                    <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-3)', color: 'var(--color-text-muted)' }}>SEMUA PAKET</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)' }}>
                                        {Object.entries(PLAN_LIMITS).map(([planKey, limits]) => {
                                            const isCurrentPlan = planKey === currentPlan;
                                            const planNames: Record<string, string> = { free: 'Free', starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' };
                                            const planColors: Record<string, string> = { free: 'var(--color-text-muted)', starter: 'var(--color-info)', pro: '#F59E0B', enterprise: 'var(--color-accent)' };
                                            return (
                                                <div key={planKey} style={{
                                                    padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)',
                                                    border: isCurrentPlan ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                                                    background: isCurrentPlan ? 'var(--color-accent-soft)' : 'transparent',
                                                    position: 'relative', overflow: 'hidden',
                                                }}>
                                                    {planKey === 'pro' && (
                                                        <div style={{ position: 'absolute', top: 8, right: -28, background: '#F59E0B', color: '#000', fontSize: 9, padding: '2px 32px', transform: 'rotate(45deg)', fontWeight: 700 }}>POPULER</div>
                                                    )}
                                                    <div style={{ textAlign: 'center', marginBottom: 'var(--space-3)' }}>
                                                        <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: planColors[planKey], marginBottom: 2 }}>{planNames[planKey]}</div>
                                                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{limits.price}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-xs)' }}>
                                                        <span><Check size={12} style={{ color: 'var(--color-success)' }} /> {limits.devices === -1 ? 'Unlimited' : limits.devices} device</span>
                                                        <span><Check size={12} style={{ color: 'var(--color-success)' }} /> {limits.broadcasts === -1 ? 'Unlimited' : limits.broadcasts} broadcast</span>
                                                        <span><Check size={12} style={{ color: 'var(--color-success)' }} /> {limits.contacts === -1 ? 'Unlimited' : limits.contacts.toLocaleString()} kontak</span>
                                                        <span><Check size={12} style={{ color: 'var(--color-success)' }} /> {limits.team_members === -1 ? 'Unlimited' : limits.team_members} anggota</span>
                                                    </div>
                                                    <div style={{ marginTop: 'var(--space-3)', textAlign: 'center' }}>
                                                        {isCurrentPlan ? (
                                                            <span className="badge badge-accent" style={{ fontSize: 'var(--text-xs)' }}>Paket Saat Ini</span>
                                                        ) : (
                                                            <button className="btn btn-sm btn-secondary" style={{ width: '100%', fontSize: 'var(--text-xs)' }} onClick={() => { setUpgradeTarget(planNames[planKey]); setShowUpgradeModal(true); }}>
                                                                {PLAN_LIMITS[planKey].priceNum > (PLAN_LIMITS[currentPlan]?.priceNum || 0) ? 'Upgrade' : 'Pilih'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--color-info-soft)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}>
                                        💡 Untuk upgrade paket, silakan hubungi tim sales kami via WhatsApp atau email. Pembayaran tersedia melalui transfer bank atau e-wallet.
                                    </div>

                                    {/* Upgrade Contact Modal */}
                                    {showUpgradeModal && (
                                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowUpgradeModal(false)}>
                                            <div style={{ background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', maxWidth: 420, width: '90%', border: '1px solid var(--color-border)' }} onClick={e => e.stopPropagation()}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                                                    <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 700 }}>🚀 Upgrade ke {upgradeTarget}</h3>
                                                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowUpgradeModal(false)}><X size={16} /></button>
                                                </div>
                                                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
                                                    {platformSettings.upgrade_message || 'Hubungi kami untuk upgrade paket langganan Anda.'}
                                                </p>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                                    {platformSettings.owner_whatsapp && (
                                                        <a href={`https://wa.me/${platformSettings.owner_whatsapp}?text=${encodeURIComponent(`Halo, saya ingin upgrade ke paket ${upgradeTarget}`)}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ background: '#22c55e', borderColor: '#22c55e', justifyContent: 'center' }}>
                                                            <Phone size={16} /> Chat WhatsApp
                                                        </a>
                                                    )}
                                                    {platformSettings.owner_email && (
                                                        <a href={`mailto:${platformSettings.owner_email}?subject=Upgrade ke ${upgradeTarget}&body=Halo, saya ingin upgrade ke paket ${upgradeTarget}`} className="btn btn-secondary" style={{ justifyContent: 'center' }}>
                                                            <Mail size={16} /> Email: {platformSettings.owner_email}
                                                        </a>
                                                    )}
                                                    {platformSettings.owner_phone && (
                                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                                                            📞 Telepon: {platformSettings.owner_phone}
                                                        </div>
                                                    )}
                                                    {!platformSettings.owner_whatsapp && !platformSettings.owner_email && (
                                                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', textAlign: 'center', fontStyle: 'italic' }}>
                                                            Kontak belum diatur. Hubungi admin platform.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
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
                                                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setShowAddForm(false); setTeamError(''); setNewAssignedDevices([]); }}>
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
                                            <div className="form-group" style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
                                                <label className="form-label">Tugaskan ke Nomor WhatsApp (Perangkat)</label>
                                                <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 8, marginTop: -4 }}>Jika tidak ada yang dicentang, agen bisa melihat semua nomor.</p>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                                                    {devices.length === 0 ? (
                                                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Belum ada perangkat terhubung.</span>
                                                    ) : devices.map(dev => (
                                                        <label key={dev.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'var(--color-bg-primary)', padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={newAssignedDevices.includes(dev.id)}
                                                                onChange={e => {
                                                                    if (e.target.checked) setNewAssignedDevices([...newAssignedDevices, dev.id]);
                                                                    else setNewAssignedDevices(newAssignedDevices.filter(id => id !== dev.id));
                                                                }}
                                                            />
                                                            {dev.name} ({dev.phone_number})
                                                        </label>
                                                    ))}
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
                                                            {(member.assigned_devices && member.assigned_devices.length > 0) ? (
                                                                <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                    <Phone size={10} /> {member.assigned_devices.length} Perangkat
                                                                </span>
                                                            ) : (
                                                                <span className="badge badge-default" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                    <Globe size={10} /> Semua Akses
                                                                </span>
                                                            )}
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
                                    {notifSaved && <div style={{ padding: 'var(--space-3)', background: 'var(--color-success-soft)', color: 'var(--color-success)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)', display: 'flex', gap: 8 }}><CheckCircle size={16} />Preferensi tersimpan!</div>}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                                        {[
                                            { key: 'new_message', label: 'Pesan masuk baru', desc: 'Notifikasi saat ada pesan WA masuk', icon: '💬' },
                                            { key: 'campaign_complete', label: 'Campaign selesai', desc: 'Notifikasi saat broadcast campaign selesai', icon: '✅' },
                                            { key: 'device_disconnect', label: 'Device terputus', desc: 'Notifikasi saat device WA terputus', icon: '🔌' },
                                        ].map(item => (
                                            <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', transition: 'all 0.15s', background: (notifPrefs as any)[item.key] ? 'transparent' : 'var(--color-bg-tertiary)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                                    <span style={{ fontSize: 20 }}>{item.icon}</span>
                                                    <div>
                                                        <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>{item.label}</div>
                                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{item.desc}</div>
                                                    </div>
                                                </div>
                                                <label style={{ position: 'relative', width: 44, height: 24, cursor: 'pointer' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={(notifPrefs as any)[item.key]}
                                                        onChange={e => setNotifPrefs(prev => ({ ...prev, [item.key]: e.target.checked }))}
                                                        style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                                                    />
                                                    <span style={{
                                                        position: 'absolute', inset: 0, borderRadius: 24,
                                                        background: (notifPrefs as any)[item.key] ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                                                        border: '2px solid ' + ((notifPrefs as any)[item.key] ? 'var(--color-accent)' : 'var(--color-border)'),
                                                        transition: 'all 0.2s',
                                                    }}>
                                                        <span style={{
                                                            position: 'absolute', width: 16, height: 16, borderRadius: '50%',
                                                            background: 'white', top: 2, left: (notifPrefs as any)[item.key] ? 22 : 2,
                                                            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                                        }} />
                                                    </span>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-5)' }}>
                                        <button className="btn btn-primary" onClick={handleSaveNotifications} disabled={notifSaving}>
                                            {notifSaving ? <><Loader2 size={16} className="animate-spin" />Menyimpan...</> : <><Save size={16} /> Simpan Preferensi</>}
                                        </button>
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
