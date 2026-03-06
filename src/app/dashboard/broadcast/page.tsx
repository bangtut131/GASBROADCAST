'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Send, Plus, Play, Pause, CheckCircle, XCircle, Clock } from 'lucide-react';
import type { Campaign } from '@/types';

export default function BroadcastPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
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
                            </tr>
                        </thead>
                        <tbody>
                            {campaigns.map(campaign => (
                                <tr key={campaign.id} style={{ cursor: 'pointer' }}>
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
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
