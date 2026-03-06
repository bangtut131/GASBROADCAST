'use client';

import { useState, useEffect } from 'react';
import {
    UserCheck, MessageSquare, Plus, Search, Circle,
    ChevronRight, Loader2, Clock, CheckCircle
} from 'lucide-react';

interface Agent {
    id: string;
    name: string;
    email: string;
    role: string;
    is_active: boolean;
}

interface CSConversation {
    phone: string;
    name: string | null;
    lastMessage: string;
    lastTime: string;
    assignedTo: string | null;
    agentName: string | null;
    status: 'unhandled' | 'assigned' | 'resolved';
}

const statusColors = { unhandled: 'badge-danger', assigned: 'badge-warning', resolved: 'badge-success' };
const statusLabels = { unhandled: 'Belum Ditangani', assigned: 'Sedang Ditangani', resolved: 'Selesai' };

export default function MultiCSPage() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [conversations, setConversations] = useState<CSConversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'unhandled' | 'assigned' | 'resolved'>('all');
    const [assigning, setAssigning] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([
            fetch('/api/cs/agents').then(r => r.json()),
            fetch('/api/cs/conversations').then(r => r.json()),
        ]).then(([a, c]) => {
            if (a.success) setAgents(a.data);
            if (c.success) setConversations(c.data);
        }).finally(() => setLoading(false));
    }, []);

    const assignConversation = async (phone: string, agentId: string | null) => {
        setAssigning(phone);
        try {
            const res = await fetch('/api/cs/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, agent_id: agentId, status: agentId ? 'assigned' : 'unhandled' }),
            });
            const data = await res.json();
            if (data.success) {
                const agent = agents.find(a => a.id === agentId);
                setConversations(prev => prev.map(c =>
                    c.phone === phone ? { ...c, assignedTo: agentId, agentName: agent?.name || null, status: agentId ? 'assigned' : 'unhandled' } : c
                ));
            }
        } catch { } finally { setAssigning(null); }
    };

    const markResolved = async (phone: string) => {
        try {
            await fetch('/api/cs/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, status: 'resolved' }),
            });
            setConversations(prev => prev.map(c => c.phone === phone ? { ...c, status: 'resolved' } : c));
        } catch { }
    };

    const filtered = conversations.filter(c => {
        const matchSearch = (c.name || c.phone).toLowerCase().includes(search.toLowerCase());
        const matchStatus = filterStatus === 'all' || c.status === filterStatus;
        return matchSearch && matchStatus;
    });

    const formatTime = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Multi-CS</h1>
                    <p className="page-description">Kelola dan assign percakapan ke agen customer service</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3" style={{ marginBottom: 'var(--space-6)' }}>
                {[
                    { label: 'Belum Ditangani', value: conversations.filter(c => c.status === 'unhandled').length, color: 'var(--color-danger)', bg: 'var(--color-danger-soft)' },
                    { label: 'Sedang Ditangani', value: conversations.filter(c => c.status === 'assigned').length, color: 'var(--color-warning)', bg: 'var(--color-warning-soft)' },
                    { label: 'Selesai', value: conversations.filter(c => c.status === 'resolved').length, color: 'var(--color-success)', bg: 'var(--color-success-soft)' },
                ].map((s, i) => (
                    <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                        <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xl)', fontWeight: 700 }}>
                            {s.value}
                        </div>
                        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{s.label}</span>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 'var(--space-6)' }}>
                {/* Agents sidebar */}
                <div className="card" style={{ alignSelf: 'start' }}>
                    <h3 style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>AGEN TERSEDIA</h3>
                    {loading ? <Loader2 size={16} className="animate-spin" /> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {agents.length === 0 ? (
                                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Tambah agen di halaman Settings → Team</p>
                            ) : agents.map(agent => (
                                <div key={agent.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                                    <div className="avatar" style={{ width: 28, height: 28, fontSize: 11, flexShrink: 0 }}>
                                        {agent.name[0].toUpperCase()}
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</div>
                                        <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{agent.role}</div>
                                    </div>
                                    <Circle size={8} style={{ color: 'var(--color-success)', fill: 'var(--color-success)', flexShrink: 0, marginLeft: 'auto' }} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Conversation List */}
                <div>
                    {/* Filters */}
                    <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', alignItems: 'center' }}>
                        <div className="search-wrapper" style={{ flex: 1 }}>
                            <Search className="search-icon" size={16} />
                            <input className="form-input" placeholder="Cari kontak..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                            {(['all', 'unhandled', 'assigned', 'resolved'] as const).map(s => (
                                <button key={s} className={`btn btn-sm ${filterStatus === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilterStatus(s)}>
                                    {s === 'all' ? 'Semua' : statusLabels[s]}
                                </button>
                            ))}
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)' }}>
                            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto var(--space-3)' }} />Memuat...
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="empty-state">
                            <UserCheck size={40} className="empty-state-icon" />
                            <h3 className="empty-state-title">Tidak ada percakapan</h3>
                            <p className="empty-state-description">Percakapan dari inbox akan muncul di sini</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                            {filtered.map(conv => (
                                <div key={conv.phone} className="card" style={{ padding: 'var(--space-4)' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                                        <div className="avatar" style={{ width: 40, height: 40, flexShrink: 0 }}>
                                            {(conv.name || conv.phone)[0].toUpperCase()}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{conv.name || conv.phone}</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                                    <span className={`badge ${statusColors[conv.status]}`}>{statusLabels[conv.status]}</span>
                                                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{formatTime(conv.lastTime)}</span>
                                                </div>
                                            </div>
                                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {conv.lastMessage}
                                            </p>
                                            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                                                {conv.agentName ? (
                                                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <UserCheck size={12} /> {conv.agentName}
                                                    </span>
                                                ) : null}
                                                <select
                                                    className="form-select"
                                                    style={{ fontSize: 'var(--text-xs)', padding: '4px 8px', height: 'auto', flex: 1, maxWidth: 200 }}
                                                    value={conv.assignedTo || ''}
                                                    onChange={e => assignConversation(conv.phone, e.target.value || null)}
                                                    disabled={assigning === conv.phone}
                                                >
                                                    <option value="">— Assign ke Agen —</option>
                                                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                                </select>
                                                {conv.status !== 'resolved' && (
                                                    <button className="btn btn-sm btn-secondary" onClick={() => markResolved(conv.phone)}>
                                                        <CheckCircle size={13} /> Selesai
                                                    </button>
                                                )}
                                                <a href={`/dashboard/inbox?phone=${conv.phone}`} className="btn btn-sm btn-ghost">
                                                    <MessageSquare size={13} /> Chat
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
