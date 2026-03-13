'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    BarChart3, Users, Smartphone, Send, Contact,
    ArrowRight, Crown, Zap, Settings, Loader2, ShieldCheck
} from 'lucide-react';

interface Stats {
    total_tenants: number;
    total_devices: number;
    connected_devices: number;
    total_campaigns: number;
    total_contacts: number;
    plan_distribution: Record<string, number>;
}

export default function AdminDashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const router = useRouter();

    useEffect(() => {
        fetch('/api/admin/stats')
            .then(r => r.json())
            .then(d => {
                if (d.success) setStats(d.data);
                else setError(d.error || 'Akses ditolak');
            })
            .catch(() => setError('Gagal memuat'))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
        </div>
    );

    if (error) return (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
            <ShieldCheck size={48} style={{ color: 'var(--color-danger)', margin: '0 auto var(--space-4)' }} />
            <h2 style={{ fontSize: 'var(--text-lg)' }}>Akses Ditolak</h2>
            <p style={{ color: 'var(--color-text-muted)' }}>{error}</p>
            <a href="/dashboard" className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }}>← Kembali ke Dashboard</a>
        </div>
    );

    const planColors: Record<string, string> = {
        free: 'var(--color-text-muted)', starter: 'var(--color-info)',
        pro: '#F59E0B', enterprise: 'var(--color-accent)'
    };

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 4 }}>
                        <Crown size={22} style={{ color: '#F59E0B' }} />
                        <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>Admin Panel</h1>
                    </div>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Kelola platform GAS Broadcast</p>
                </div>
                <a href="/dashboard" className="btn btn-secondary btn-sm">← Dashboard</a>
            </div>

            {/* Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                {[
                    { label: 'Total Pelanggan', value: stats?.total_tenants || 0, icon: <Users size={20} />, color: 'var(--color-accent)' },
                    { label: 'Total Device', value: stats?.total_devices || 0, sub: `${stats?.connected_devices || 0} connected`, icon: <Smartphone size={20} />, color: '#22c55e' },
                    { label: 'Total Broadcast', value: stats?.total_campaigns || 0, icon: <Send size={20} />, color: '#F59E0B' },
                    { label: 'Total Kontak', value: stats?.total_contacts || 0, icon: <Contact size={20} />, color: 'var(--color-info)' },
                ].map(stat => (
                    <div key={stat.label} className="card" style={{ padding: 'var(--space-4)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 4 }}>{stat.label}</div>
                                <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{stat.value.toLocaleString()}</div>
                                {(stat as any).sub && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)', marginTop: 2 }}>{(stat as any).sub}</div>}
                            </div>
                            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: `${stat.color}15`, color: stat.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {stat.icon}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Plan Distribution */}
            <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)' }}>📊 Distribusi Paket</h3>
                <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                    {Object.entries(stats?.plan_distribution || {}).map(([plan, count]) => (
                        <div key={plan} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', minWidth: 120 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: planColors[plan] || 'var(--color-text-muted)' }} />
                            <div>
                                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, textTransform: 'capitalize' }}>{plan}</div>
                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{count} pelanggan</div>
                            </div>
                        </div>
                    ))}
                    {Object.keys(stats?.plan_distribution || {}).length === 0 && (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Belum ada data</span>
                    )}
                </div>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <a href="/admin/tenants" className="card" style={{ textDecoration: 'none', padding: 'var(--space-5)', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', background: 'var(--color-accent-soft)', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Users size={20} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>Kelola Pelanggan</div>
                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Ubah paket, lihat usage</div>
                            </div>
                        </div>
                        <ArrowRight size={18} style={{ color: 'var(--color-text-muted)' }} />
                    </div>
                </a>
                <a href="/admin/settings" className="card" style={{ textDecoration: 'none', padding: 'var(--space-5)', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', background: 'rgba(245,158,11,0.1)', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Settings size={20} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>Profil & Kontak Owner</div>
                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Atur info kontak untuk upgrade</div>
                            </div>
                        </div>
                        <ArrowRight size={18} style={{ color: 'var(--color-text-muted)' }} />
                    </div>
                </a>
                <a href="/admin/roles" className="card" style={{ textDecoration: 'none', padding: 'var(--space-5)', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid var(--color-border)', gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', background: 'var(--color-info-soft)', color: 'var(--color-info)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ShieldCheck size={20} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>Custom Roles</div>
                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Kelola hak akses role kustom untuk Agen/Member</div>
                            </div>
                        </div>
                        <ArrowRight size={18} style={{ color: 'var(--color-text-muted)' }} />
                    </div>
                </a>
            </div>
        </div>
    );
}
