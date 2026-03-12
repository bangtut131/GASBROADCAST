'use client';

import { useState, useEffect } from 'react';
import {
    Users, Crown, ArrowLeft, Loader2, Search,
    ChevronDown, CheckCircle, AlertCircle, Smartphone, Trash2
} from 'lucide-react';

interface Tenant {
    id: string;
    name: string;
    plan: string;
    created_at: string;
    device_count: number;
    member_count: number;
    owner_name: string;
}

const PLAN_OPTIONS = ['free', 'starter', 'pro', 'enterprise'];
const PLAN_COLORS: Record<string, string> = {
    free: 'badge-default', starter: 'badge-info', pro: 'badge-warning', enterprise: 'badge-accent'
};

export default function AdminTenantsPage() {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterPlan, setFilterPlan] = useState('');
    const [saving, setSaving] = useState<string | null>(null);
    const [saved, setSaved] = useState('');

    useEffect(() => {
        fetch('/api/admin/tenants')
            .then(r => r.json())
            .then(d => { if (d.success) setTenants(d.data); })
            .finally(() => setLoading(false));
    }, []);

    const handleChangePlan = async (tenantId: string, newPlan: string) => {
        setSaving(tenantId);
        try {
            const res = await fetch('/api/admin/tenants', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenant_id: tenantId, plan: newPlan }),
            });
            const data = await res.json();
            if (data.success) {
                setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, plan: newPlan } : t));
                setSaved(tenantId);
                setTimeout(() => setSaved(''), 2000);
            }
        } catch { }
        finally { setSaving(null); }
    };

    const handleDeleteTenant = async (tenantId: string, tenantName: string) => {
        if (!confirm(`PERINGATAN! Anda yakin ingin menghapus pelanggan "${tenantName}"? Semua data mereka (kontak, pesan, perangkat) akan DIBERSIHKAN PERMANEN dari database.`)) return;

        setSaving(tenantId);
        try {
            const res = await fetch(`/api/admin/tenants?id=${tenantId}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setTenants(prev => prev.filter(t => t.id !== tenantId));
            } else {
                alert('Gagal menghapus: ' + data.error);
            }
        } catch (error: any) {
            alert('Terjadi kesalahan: ' + error.message);
        } finally {
            setSaving(null);
        }
    };

    const filtered = tenants.filter(t => {
        const matchSearch = !search ||
            t.name.toLowerCase().includes(search.toLowerCase()) ||
            t.owner_name.toLowerCase().includes(search.toLowerCase());
        const matchPlan = !filterPlan || t.plan === filterPlan;
        return matchSearch && matchPlan;
    });

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <a href="/admin" className="btn btn-ghost btn-icon"><ArrowLeft size={18} /></a>
                    <div>
                        <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>Kelola Pelanggan</h1>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{tenants.length} pelanggan terdaftar</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                    <input className="form-input" placeholder="Cari nama tenant/owner..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 34 }} />
                </div>
                <select className="form-select" value={filterPlan} onChange={e => setFilterPlan(e.target.value)} style={{ minWidth: 140 }}>
                    <option value="">Semua Paket</option>
                    {PLAN_OPTIONS.map(p => <option key={p} value={p} style={{ textTransform: 'capitalize' }}>{p}</option>)}
                </select>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                    <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto', color: 'var(--color-accent)' }} />
                </div>
            ) : filtered.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                    <Users size={40} style={{ color: 'var(--color-text-muted)', margin: '0 auto var(--space-3)' }} />
                    <p style={{ color: 'var(--color-text-muted)' }}>Tidak ada pelanggan ditemukan</p>
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-tertiary)' }}>
                                <th style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Tenant</th>
                                <th style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Owner</th>
                                <th style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Device</th>
                                <th style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Paket</th>
                                <th style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Terdaftar</th>
                                <th style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center', fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(t => (
                                <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)', transition: 'background 0.15s' }}>
                                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{t.id.slice(0, 8)}...</div>
                                    </td>
                                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                                        <span>{t.owner_name}</span>
                                    </td>
                                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                            <Smartphone size={13} style={{ color: 'var(--color-text-muted)' }} />
                                            <span>{t.device_count}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}>
                                            <select
                                                className="form-select"
                                                value={t.plan}
                                                onChange={e => handleChangePlan(t.id, e.target.value)}
                                                disabled={saving === t.id}
                                                style={{ height: 32, fontSize: 'var(--text-xs)', minWidth: 110, textTransform: 'capitalize', padding: '0 var(--space-2)' }}
                                            >
                                                {PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                                            </select>
                                            {saving === t.id && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-accent)' }} />}
                                            {saved === t.id && <CheckCircle size={14} style={{ color: 'var(--color-success)' }} />}
                                        </div>
                                    </td>
                                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                                        {new Date(t.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </td>
                                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                                        <button 
                                            className="btn btn-ghost btn-sm btn-icon" 
                                            onClick={() => handleDeleteTenant(t.id, t.name)}
                                            style={{ color: 'var(--color-danger)' }}
                                            title="Hapus Pelanggan"
                                            disabled={saving === t.id}
                                        >
                                            {saving === t.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
