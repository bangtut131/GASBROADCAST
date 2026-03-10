'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Send, Plus, Play, Pause, CheckCircle, XCircle, Clock, Trash2, Loader2, RotateCw } from 'lucide-react';
import type { Campaign } from '@/types';

export default function BroadcastPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [running, setRunning] = useState<string | null>(null);
    const supabase = createClient();

    useEffect(() => {
        loadCampaigns();
    }, []);

    const loadCampaigns = async () => {
        try {
            const { data } = await supabase
                .from('campaigns')
                .select('*, device:devices(name, phone_number)')
                .order('created_at', { ascending: false });
            setCampaigns(data || []);
        } catch (err) {
            console.error('Error loading campaigns:', err);
        } finally {
            setLoading(false);
        }
    };

    const deleteCampaign = async (id: string, name: string) => {
        if (!confirm(`Hapus campaign "${name}"? Semua data broadcast terkait juga akan dihapus.`)) return;
        setDeleting(id);
        try {
            const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setCampaigns(prev => prev.filter(c => c.id !== id));
            } else {
                alert('Gagal menghapus: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            alert('Gagal menghapus campaign');
        } finally {
            setDeleting(null);
        }
    };

    const runCampaign = async (id: string) => {
        setRunning(id);
        try {
            const res = await fetch(`/api/campaigns/${id}/run`, { method: 'POST' });
            const data = await res.json();
            if (!data.success) alert('Gagal: ' + (data.error || 'Unknown'));
            // Reload to show updated counts
            loadCampaigns();
        } catch {
            alert('Gagal menjalankan broadcast');
        } finally {
            setRunning(null);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'running': return <span className="badge badge-success"><Play size={10} /> Running</span>;
            case 'completed': return <span className="badge badge-info"><CheckCircle size={10} /> Completed</span>;
            case 'paused': return <span className="badge badge-warning"><Pause size={10} /> Paused</span>;
            case 'failed': return <span className="badge badge-danger"><XCircle size={10} /> Failed</span>;
            case 'scheduled': return <span className="badge badge-accent"><Clock size={10} /> Scheduled</span>;
            default: return <span className="badge badge-default">Draft</span>;
        }
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Broadcast</h1>
                    <p className="page-description">Kirim pesan massal ke daftar kontak</p>
                </div>
                <div className="page-actions">
                    <a href="/dashboard/broadcast/create" className="btn btn-primary">
                        <Plus size={16} /> Buat Campaign
                    </a>
                </div>
            </div>

            {loading ? (
                <div className="card">
                    <div className="skeleton" style={{ height: 300 }} />
                </div>
            ) : campaigns.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <Send size={48} className="empty-state-icon" />
                        <h3 className="empty-state-title">Belum Ada Campaign</h3>
                        <p className="empty-state-description">
                            Buat campaign broadcast pertama Anda untuk mulai mengirim pesan ke banyak kontak sekaligus.
                        </p>
                        <a href="/dashboard/broadcast/create" className="btn btn-primary">
                            <Plus size={16} /> Buat Campaign Pertama
                        </a>
                    </div>
                </div>
            ) : (
                <div className="table-wrapper">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Campaign</th>
                                <th>Device</th>
                                <th>Status</th>
                                <th>Progress</th>
                                <th>Terkirim</th>
                                <th>Gagal</th>
                                <th>Tanggal</th>
                                <th style={{ width: 60, textAlign: 'center' }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {campaigns.map(campaign => (
                                <tr key={campaign.id}>
                                    <td>
                                        <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                                            {campaign.name}
                                        </span>
                                    </td>
                                    <td>
                                        {(campaign.device as any)?.name || '-'}
                                    </td>
                                    <td>{getStatusBadge(campaign.status)}</td>
                                    <td>
                                        <div className="progress-bar" style={{ width: 100 }}>
                                            <div
                                                className="progress-bar-fill"
                                                style={{
                                                    width: campaign.total_recipients > 0
                                                        ? `${((campaign.sent_count + campaign.failed_count) / campaign.total_recipients) * 100}%`
                                                        : '0%'
                                                }}
                                            />
                                        </div>
                                    </td>
                                    <td>
                                        <span style={{ color: 'var(--color-success)' }}>{campaign.sent_count}</span>
                                        <span style={{ color: 'var(--color-text-muted)' }}> / {campaign.total_recipients}</span>
                                    </td>
                                    <td>
                                        <span style={{ color: campaign.failed_count > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                                            {campaign.failed_count}
                                        </span>
                                    </td>
                                    <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
                                        {new Date(campaign.created_at).toLocaleDateString('id-ID')}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                                            {(campaign.status === 'running' || campaign.status === 'draft') && (
                                                <button
                                                    className="btn btn-ghost btn-icon btn-sm"
                                                    style={{ color: 'var(--color-success)' }}
                                                    onClick={() => runCampaign(campaign.id)}
                                                    disabled={running === campaign.id}
                                                    title="Jalankan broadcast"
                                                >
                                                    {running === campaign.id ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                                                </button>
                                            )}
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                style={{ color: 'var(--color-danger)' }}
                                                onClick={() => deleteCampaign(campaign.id, campaign.name)}
                                                disabled={deleting === campaign.id}
                                                title="Hapus campaign"
                                            >
                                                {deleting === campaign.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                                            </button>
                                        </div>
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
