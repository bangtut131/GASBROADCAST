'use client';

import { useState, useEffect } from 'react';
import {
    Users, Smartphone, Send, MessageSquare, TrendingUp,
    ArrowRight, Plus, Wifi, Zap, Clock
} from 'lucide-react';
import Link from 'next/link';

interface Stats {
    totalContacts: number;
    totalDevices: number;
    connectedDevices: number;
    totalCampaigns: number;
    messagesSentToday: number;
    messagesReceivedToday: number;
    recentCampaigns: Array<{
        id: string; name: string; status: string;
        sent_count: number; total_recipients: number; created_at: string;
    }>;
}

const statusColors: Record<string, string> = {
    running: 'badge-success', completed: 'badge-accent', draft: 'badge-default',
    scheduled: 'badge-warning', paused: 'badge-warning', failed: 'badge-danger',
};
const statusLabels: Record<string, string> = {
    running: 'Berjalan', completed: 'Selesai', draft: 'Draft',
    scheduled: 'Terjadwal', paused: 'Dijeda', failed: 'Gagal',
};

export default function DashboardPage() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/dashboard/stats')
            .then(r => r.json())
            .then(d => { if (d.success) setStats(d.data); })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const statCards = [
        {
            label: 'Total Kontak', value: stats?.totalContacts ?? '—',
            icon: <Users size={22} />, color: 'var(--color-accent)',
            bg: 'var(--color-accent-soft)', href: '/dashboard/contacts',
        },
        {
            label: 'Device Terhubung', value: stats ? `${stats.connectedDevices}/${stats.totalDevices}` : '—',
            icon: <Smartphone size={22} />, color: 'var(--color-whatsapp)',
            bg: 'var(--color-whatsapp-soft)', href: '/dashboard/devices',
        },
        {
            label: 'Pesan Terkirim Hari Ini', value: stats?.messagesSentToday ?? '—',
            icon: <Send size={22} />, color: 'var(--color-success)',
            bg: 'var(--color-success-soft)', href: '/dashboard/broadcast',
        },
        {
            label: 'Pesan Diterima Hari Ini', value: stats?.messagesReceivedToday ?? '—',
            icon: <MessageSquare size={22} />, color: 'var(--color-info)',
            bg: 'var(--color-info-soft)', href: '/dashboard/inbox',
        },
    ];

    const quickActions = [
        { label: 'Buat Broadcast', href: '/dashboard/broadcast/create', icon: <Send size={18} />, primary: true },
        { label: 'Hubungkan Device', href: '/dashboard/devices/connect', icon: <Wifi size={18} />, primary: false },
        { label: 'Import Kontak', href: '/dashboard/contacts/import', icon: <Users size={18} />, primary: false },
        { label: 'Generate API Key', href: '/dashboard/api-keys', icon: <Zap size={18} />, primary: false },
    ];

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-description">Selamat datang kembali! Berikut ringkasan hari ini.</p>
                </div>
                <Link href="/dashboard/broadcast/create" className="btn btn-primary">
                    <Plus size={16} /> Buat Broadcast
                </Link>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-4" style={{ marginBottom: 'var(--space-6)' }}>
                {statCards.map((card, i) => (
                    <Link key={i} href={card.href} style={{ textDecoration: 'none' }}>
                        <div className="card card-hover" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', cursor: 'pointer' }}>
                            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-lg)', background: card.bg, color: card.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {card.icon}
                            </div>
                            <div>
                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-1)' }}>{card.label}</div>
                                <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: loading ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}>
                                    {loading ? '...' : card.value}
                                </div>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 'var(--space-6)' }}>
                {/* Recent Campaigns */}
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
                        <h3 style={{ fontSize: 'var(--text-md)' }}>Campaign Terbaru</h3>
                        <Link href="/dashboard/broadcast" className="btn btn-ghost btn-sm">
                            Lihat Semua <ArrowRight size={14} />
                        </Link>
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Memuat...</div>
                    ) : !stats?.recentCampaigns?.length ? (
                        <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                            <Send size={32} className="empty-state-icon" />
                            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Belum ada campaign</p>
                            <Link href="/dashboard/broadcast/create" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-3)' }}>
                                <Plus size={14} /> Buat Campaign Pertama
                            </Link>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                            {stats.recentCampaigns.map(c => {
                                const progress = c.total_recipients > 0
                                    ? Math.round((c.sent_count / c.total_recipients) * 100) : 0;
                                return (
                                    <Link key={c.id} href={`/dashboard/broadcast/${c.id}`} style={{ textDecoration: 'none' }}>
                                        <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all var(--transition-fast)' }}
                                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border-hover)'}
                                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)'}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                                                <span style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>{c.name}</span>
                                                <span className={`badge ${statusColors[c.status] || 'badge-default'}`}>{statusLabels[c.status] || c.status}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                                <div className="progress-bar" style={{ flex: 1 }}>
                                                    <div className="progress-bar-fill progress-bar-success" style={{ width: `${progress}%` }} />
                                                </div>
                                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                                                    {c.sent_count}/{c.total_recipients} ({progress}%)
                                                </span>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Quick Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <div className="card">
                        <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)' }}>⚡ Aksi Cepat</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {quickActions.map((action, i) => (
                                <Link key={i} href={action.href} className={`btn ${action.primary ? 'btn-primary' : 'btn-secondary'}`} style={{ justifyContent: 'flex-start', gap: 'var(--space-3)' }}>
                                    {action.icon} {action.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* API Quick start */}
                    <div className="card card-accent">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                            <Zap size={18} style={{ color: 'var(--color-accent)' }} />
                            <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>REST API</h4>
                        </div>
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
                            Integrasi WA ke sistem Anda lewat REST API
                        </p>
                        <pre style={{ fontSize: 10, background: 'var(--color-bg-tertiary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', overflow: 'auto', color: 'var(--color-text-secondary)' }}>
                            {`POST /api/v1/messages/send
{
  "to": "628123456789",
  "message": "Halo!"
}`}
                        </pre>
                        <Link href="/dashboard/api-keys" className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-3)', width: '100%' }}>
                            Generate API Key →
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
