'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Bot, Plus, ToggleLeft, ToggleRight, Trash2, Pencil } from 'lucide-react';
import type { AutoReplyRule } from '@/types';

export default function AutoReplyPage() {
    const [rules, setRules] = useState<AutoReplyRule[]>([]);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        loadRules();
    }, []);

    const loadRules = async () => {
        try {
            const { data } = await supabase
                .from('autoreply_rules')
                .select('*')
                .order('priority', { ascending: true });
            setRules(data || []);
        } catch (err) {
            console.error('Error loading rules:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Auto Reply</h1>
                    <p className="page-description">Atur balasan otomatis berdasarkan keyword atau AI</p>
                </div>
                <div className="page-actions">
                    <button className="btn btn-primary">
                        <Plus size={16} /> Tambah Rule
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="card">
                    <div className="skeleton" style={{ height: 200 }} />
                </div>
            ) : rules.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <Bot size={48} className="empty-state-icon" />
                        <h3 className="empty-state-title">Belum Ada Auto Reply</h3>
                        <p className="empty-state-description">
                            Buat rule auto-reply untuk membalas pesan masuk secara otomatis berdasarkan keyword.
                        </p>
                        <button className="btn btn-primary">
                            <Plus size={16} /> Buat Rule Pertama
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {rules.map(rule => (
                        <div key={rule.id} className="card card-hover">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <button
                                        className={`toggle ${rule.is_active ? 'active' : ''}`}
                                        title={rule.is_active ? 'Aktif' : 'Nonaktif'}
                                    />
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{rule.name}</div>
                                        <div className="flex items-center gap-2" style={{ marginTop: 'var(--space-1)' }}>
                                            <span className="badge badge-accent">{rule.trigger_type}</span>
                                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                                                {rule.trigger_value}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button className="btn btn-ghost btn-icon btn-sm">
                                        <Pencil size={14} />
                                    </button>
                                    <button className="btn btn-ghost btn-icon btn-sm">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                            <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                                {rule.response_text}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
