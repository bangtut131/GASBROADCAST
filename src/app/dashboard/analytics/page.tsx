'use client';

import { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';
import { TrendingUp, Users, Send, MessageSquare, Target, Activity, Loader2 } from 'lucide-react';

const COLORS = ['#6C63FF', '#25D366', '#3B82F6', '#F59E0B', '#EF4444'];

interface AnalyticsData {
    campaignStats: { name: string; sent: number; failed: number; total: number }[];
    messageVolume: { date: string; inbound: number; outbound: number }[];
    contactGrowth: { date: string; total: number }[];
    statusDistribution: { name: string; value: number }[];
    summary: {
        totalMessages: number;
        totalCampaigns: number;
        totalContacts: number;
        avgDeliveryRate: number;
    };
}

export default function AnalyticsPage() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

    useEffect(() => {
        fetch(`/api/analytics?period=${period}`)
            .then(r => r.json())
            .then(d => { if (d.success) setData(d.data); })
            .finally(() => setLoading(false));
    }, [period]);

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400, color: 'var(--color-text-muted)', gap: 12 }}>
            <Loader2 size={24} className="animate-spin" /> Memuat analytics...
        </div>
    );

    const summary = data?.summary || { totalMessages: 0, totalCampaigns: 0, totalContacts: 0, avgDeliveryRate: 0 };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Analytics</h1>
                    <p className="page-description">Statistik dan laporan kampanye broadcast</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    {(['7d', '30d', '90d'] as const).map(p => (
                        <button key={p} className={`btn btn-sm ${period === p ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setPeriod(p); setLoading(true); }}>
                            {p === '7d' ? '7 Hari' : p === '30d' ? '30 Hari' : '90 Hari'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-4" style={{ marginBottom: 'var(--space-6)' }}>
                {[
                    { label: 'Total Pesan', value: summary.totalMessages.toLocaleString(), icon: <MessageSquare size={20} />, color: 'var(--color-accent)', bg: 'var(--color-accent-soft)' },
                    { label: 'Campaign Berjalan', value: summary.totalCampaigns.toLocaleString(), icon: <Target size={20} />, color: 'var(--color-success)', bg: 'var(--color-success-soft)' },
                    { label: 'Total Kontak', value: summary.totalContacts.toLocaleString(), icon: <Users size={20} />, color: 'var(--color-info)', bg: 'var(--color-info-soft)' },
                    { label: 'Avg Delivery Rate', value: `${summary.avgDeliveryRate.toFixed(1)}%`, icon: <TrendingUp size={20} />, color: 'var(--color-warning)', bg: 'var(--color-warning-soft)' },
                ].map((card, i) => (
                    <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                        <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', background: card.bg, color: card.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {card.icon}
                        </div>
                        <div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{card.label}</div>
                            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{card.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
                {/* Message Volume Chart */}
                <div className="card">
                    <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)' }}>📊 Volume Pesan Harian</h3>
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={data?.messageVolume || []}>
                            <defs>
                                <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6C63FF" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#6C63FF" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#25D366" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#25D366" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                            <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                            <Tooltip contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }} />
                            <Area type="monotone" dataKey="outbound" stroke="#6C63FF" fill="url(#colorOut)" name="Keluar" strokeWidth={2} />
                            <Area type="monotone" dataKey="inbound" stroke="#25D366" fill="url(#colorIn)" name="Masuk" strokeWidth={2} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Contact Growth */}
                <div className="card">
                    <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)' }}>👥 Pertumbuhan Kontak</h3>
                    <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={data?.contactGrowth || []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                            <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                            <Tooltip contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }} />
                            <Line type="monotone" dataKey="total" stroke="#3B82F6" strokeWidth={2.5} dot={false} name="Total Kontak" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-6)' }}>
                {/* Campaign Performance */}
                <div className="card">
                    <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)' }}>📢 Performa Campaign</h3>
                    {(!data?.campaignStats || data.campaignStats.length === 0) ? (
                        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Belum ada campaign</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={data.campaignStats}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} />
                                <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} />
                                <Tooltip contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }} />
                                <Bar dataKey="sent" fill="#6C63FF" name="Terkirim" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="failed" fill="#EF4444" name="Gagal" radius={[4, 4, 0, 0]} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Status Distribution */}
                <div className="card">
                    <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)' }}>📊 Status Pesan</h3>
                    {(!data?.statusDistribution || data.statusDistribution.length === 0) ? (
                        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Belum ada data</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie data={data.statusDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                                    {data.statusDistribution.map((_, index) => (
                                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 12 }} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>
        </div>
    );
}
