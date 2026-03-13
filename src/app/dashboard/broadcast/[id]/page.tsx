'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, CheckCircle, Clock, Play, AlertCircle, RefreshCw, XCircle } from 'lucide-react';
import type { Campaign } from '@/types';

interface BroadcastMessage {
    id: string;
    phone: string;
    status: string;
    error_message: string | null;
    sent_at: string | null;
    contact?: {
        name: string | null;
    } | null;
}

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const supabase = createClient();

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [messages, setMessages] = useState<BroadcastMessage[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();

        // Subscribe to messages changes
        const msgsChannel = supabase.channel(`campaign_messages_${id}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'broadcast_messages', filter: `campaign_id=eq.${id}` },
                (payload) => {
                    setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
                }
            )
            .subscribe();

        // Subscribe to campaign count changes
        const campChannel = supabase.channel(`campaign_detail_${id}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${id}` },
                (payload) => {
                    if (payload.new) setCampaign(prev => prev ? { ...prev, ...payload.new } : prev);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(msgsChannel);
            supabase.removeChannel(campChannel);
        };
    }, [id]);

    const loadData = async () => {
        try {
            // Load campaign
            const { data: campData } = await supabase
                .from('campaigns')
                .select('*, device:devices(name)')
                .eq('id', id)
                .single();
            if (campData) setCampaign(campData);

            // Load messages
            const { data: msgData, error } = await supabase
                .from('broadcast_messages')
                .select('*, contact:contacts(name)')
                .eq('campaign_id', id)
                .order('phone', { ascending: true });
                
            if (error) {
                console.error("Error loading messages:", error);
            }
                
            if (msgData) setMessages(msgData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-[var(--color-text-muted)]"><RefreshCw className="animate-spin mx-auto mb-4" /> Memuat detail...</div>;
    }

    if (!campaign) {
        return (
            <div className="p-8 text-center">
                <AlertCircle className="mx-auto text-[var(--color-danger)] mb-4" size={48} />
                <h2 className="text-xl mb-4">Campaign tidak ditemukan</h2>
                <button onClick={() => router.back()} className="btn btn-secondary">Kembali</button>
            </div>
        );
    }

    const progress = campaign.total_recipients > 0 
        ? ((campaign.sent_count + campaign.failed_count) / campaign.total_recipients) * 100 
        : 0;

    return (
        <div>
            <div className="page-header relative">
                <div className="flex items-center gap-3">
                    <button onClick={() => router.push('/dashboard/broadcast')} className="btn btn-ghost btn-icon">
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="page-title leading-none">{campaign.name}</h1>
                            <span className={`badge ${campaign.status === 'completed' ? 'badge-info' : campaign.status === 'running' ? 'badge-success' : campaign.status === 'failed' ? 'badge-danger' : 'badge-default'}`}>
                                {campaign.status}
                            </span>
                        </div>
                        <p className="page-description mt-1">
                            Dibuat pada {new Date(campaign.created_at).toLocaleString('id-ID')}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="card">
                    <div className="text-sm text-[var(--color-text-muted)] mb-1">Progress</div>
                    <div className="text-2xl font-bold mb-3">{Math.round(progress)}%</div>
                    <div className="progress-bar w-full">
                        <div className="progress-bar-fill transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                </div>
                <div className="card">
                    <div className="text-sm text-[var(--color-text-muted)] mb-1">Status Pengiriman</div>
                    <div className="flex gap-4 mt-2">
                        <div>
                            <div className="flex items-center gap-1 text-[var(--color-success)] text-sm font-semibold">
                                <CheckCircle size={14} /> Terkirim
                            </div>
                            <div className="text-xl">{campaign.sent_count}</div>
                        </div>
                        <div>
                            <div className="flex items-center gap-1 text-[var(--color-danger)] text-sm font-semibold">
                                <XCircle size={14} /> Gagal/Blokir
                            </div>
                            <div className="text-xl">{campaign.failed_count}</div>
                        </div>
                        <div>
                            <div className="flex items-center gap-1 text-[var(--color-text-muted)] text-sm font-semibold">
                                <Clock size={14} /> Antre
                            </div>
                            <div className="text-xl">
                                {Math.max(0, campaign.total_recipients - campaign.sent_count - campaign.failed_count)}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="card">
                    <div className="text-sm text-[var(--color-text-muted)] mb-1">Informasi</div>
                    <div className="text-sm flex flex-col gap-1 mt-2">
                        <div className="flex justify-between">
                            <span className="text-[var(--color-text-muted)]">Device:</span>
                            <span>{(campaign.device as any)?.name || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[var(--color-text-muted)]">Target:</span>
                            <span>{campaign.total_recipients} Penerima</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-[var(--color-text-muted)]">Media:</span>
                            <span className="capitalize">{campaign.media_type || 'Teks Saja'}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card">
                <h3 className="text-md font-semibold mb-4">Daftar Penerima</h3>
                <div className="table-wrapper">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>No. Telepon</th>
                                <th>Nama Kontak</th>
                                <th>Status</th>
                                <th>Waktu</th>
                                <th>Keterangan</th>
                            </tr>
                        </thead>
                        <tbody>
                            {messages.map(msg => (
                                <tr key={msg.id}>
                                    <td className="font-medium">{msg.phone}</td>
                                    <td className="text-[var(--color-text-muted)]">
                                        {msg.contact?.name || '-'}
                                    </td>
                                    <td>
                                        {msg.status === 'sent' && <span className="badge badge-success"><CheckCircle size={10} /> Terkirim</span>}
                                        {msg.status === 'failed' && <span className="badge badge-danger"><XCircle size={10} /> Gagal</span>}
                                        {msg.status === 'pending' && <span className="badge badge-default"><Clock size={10} /> Antre</span>}
                                    </td>
                                    <td className="text-xs text-[var(--color-text-muted)]">
                                        {msg.sent_at ? new Date(msg.sent_at).toLocaleTimeString('id-ID') : '-'}
                                    </td>
                                    <td className="text-xs text-[var(--color-danger)] max-w-xs truncate" title={msg.error_message || ''}>
                                        {msg.error_message === 'BLACKLISTED' ? 'Diblokir Pengguna (Unsubscribe)' : (msg.error_message || '-')}
                                    </td>
                                </tr>
                            ))}
                            {messages.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-8 text-[var(--color-text-muted)]">
                                        Tidak ada data penerima
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
