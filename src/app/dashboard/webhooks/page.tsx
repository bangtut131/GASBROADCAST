'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Webhook as WebhookIcon, Plus, Trash2, ExternalLink } from 'lucide-react';
import type { Webhook } from '@/types';

export default function WebhooksPage() {
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        loadWebhooks();
    }, []);

    const loadWebhooks = async () => {
        try {
            const { data } = await supabase
                .from('webhooks')
                .select('*')
                .order('created_at', { ascending: false });
            setWebhooks(data || []);
        } catch (err) {
            console.error('Error loading webhooks:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Webhooks</h1>
                    <p className="page-description">Terima notifikasi real-time di server Anda</p>
                </div>
                <div className="page-actions">
                    <button className="btn btn-primary">
                        <Plus size={16} /> Tambah Webhook
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="card">
                    <div className="skeleton" style={{ height: 200 }} />
                </div>
            ) : webhooks.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <WebhookIcon size={48} className="empty-state-icon" />
                        <h3 className="empty-state-title">Belum Ada Webhook</h3>
                        <p className="empty-state-description">
                            Konfigurasi webhook URL untuk menerima notifikasi saat ada pesan masuk, pesan terkirim, dan event lainnya.
                        </p>
                        <button className="btn btn-primary">
                            <Plus size={16} /> Tambah Webhook
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {webhooks.map(wh => (
                        <div key={wh.id} className="card card-hover">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2" style={{ marginBottom: 'var(--space-2)' }}>
                                        <code style={{ fontSize: 'var(--text-sm)', color: 'var(--color-accent)' }}>
                                            {wh.url}
                                        </code>
                                        <ExternalLink size={12} style={{ color: 'var(--color-text-muted)' }} />
                                    </div>
                                    <div className="flex gap-1 flex-wrap">
                                        {wh.events?.map((ev, i) => (
                                            <span key={i} className="badge badge-default">{ev}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        className={`toggle ${wh.is_active ? 'active' : ''}`}
                                        title={wh.is_active ? 'Active' : 'Inactive'}
                                    />
                                    <button className="btn btn-ghost btn-icon btn-sm">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
