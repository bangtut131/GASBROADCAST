'use client';

import { useState, useEffect } from 'react';
import {
    Bot, Plus, Zap, MessageSquare, Code, Brain,
    Trash2, Power, ChevronDown, ChevronUp, Loader2,
    AlertCircle, CheckCircle, X, Settings, Eye, EyeOff
} from 'lucide-react';

const TRIGGER_TYPES = [
    { id: 'keyword', label: '🔑 Keyword Exact', desc: 'Cocok persis dengan kata kunci' },
    { id: 'contains', label: '✍️ Contains', desc: 'Pesan mengandung kata kunci' },
    { id: 'regex', label: '🔧 Regex', desc: 'Pola ekspresi reguler' },
    { id: 'ai', label: '🤖 AI Reply', desc: 'Balas otomatis pakai AI (SumoPod, OpenRouter, dll)' },
];

const AI_PRESETS = [
    { id: 'sumopod', label: 'SumoPod', baseUrl: 'https://api.sumopod.com/v1', placeholder_models: ['gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-pro'] },
    { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', placeholder_models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.1-70b-instruct'] },
    { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', placeholder_models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'] },
    { id: 'groq', label: 'Groq (Ultra Fast)', baseUrl: 'https://api.groq.com/openai/v1', placeholder_models: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it'] },
    { id: 'custom', label: 'Custom Endpoint', baseUrl: '', placeholder_models: [] },
];

interface AutoReplyRule {
    id: string;
    name: string;
    trigger_type: string;
    trigger_value: string | null;
    response_text: string;
    is_active: boolean;
    priority: number;
    ai_model: string | null;
    ai_base_url: string | null;
    ai_system_prompt: string | null;
    created_at: string;
}

const defaultForm = {
    name: '', trigger_type: 'keyword', trigger_value: '',
    response_text: '', priority: 0,
    ai_preset: 'sumopod', ai_base_url: 'https://api.sumopod.com/v1',
    ai_api_key: '', ai_model: '', ai_system_prompt: '', ai_temperature: 0.7,
    ai_max_tokens: 512, ai_context_turns: 5,
};

export default function AutoReplyPage() {
    const [rules, setRules] = useState<AutoReplyRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState(defaultForm);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [expandedRule, setExpandedRule] = useState<string | null>(null);

    useEffect(() => { loadRules(); }, []);

    const loadRules = async () => {
        try {
            const res = await fetch('/api/autoreply');
            const data = await res.json();
            if (data.success) setRules(data.data);
        } catch { } finally { setLoading(false); }
    };

    const handlePresetChange = (presetId: string) => {
        const preset = AI_PRESETS.find(p => p.id === presetId);
        if (preset) {
            setForm(f => ({ ...f, ai_preset: presetId, ai_base_url: preset.baseUrl, ai_model: '' }));
        }
    };

    const selectedPreset = AI_PRESETS.find(p => p.id === form.ai_preset) || AI_PRESETS[0];

    const handleSave = async () => {
        if (!form.name) { setError('Nama rule wajib diisi'); return; }
        setSaving(true); setError('');
        try {
            const payload: Record<string, unknown> = {
                name: form.name,
                trigger_type: form.trigger_type,
                trigger_value: form.trigger_value || null,
                response_text: form.response_text || '',
                priority: form.priority,
            };
            if (form.trigger_type === 'ai') {
                Object.assign(payload, {
                    ai_base_url: form.ai_base_url,
                    ai_api_key: form.ai_api_key,
                    ai_model: form.ai_model,
                    ai_system_prompt: form.ai_system_prompt,
                    ai_temperature: form.ai_temperature,
                    ai_max_tokens: form.ai_max_tokens,
                    ai_context_turns: form.ai_context_turns,
                    response_text: '__ai__',
                });
            }
            const res = await fetch('/api/autoreply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setRules(prev => [data.data, ...prev]);
            setShowCreate(false);
            setForm(defaultForm);
        } catch (err: any) { setError(err.message); }
        finally { setSaving(false); }
    };

    const toggleActive = async (id: string, current: boolean) => {
        try {
            await fetch(`/api/autoreply/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !current }) });
            setRules(prev => prev.map(r => r.id === id ? { ...r, is_active: !current } : r));
        } catch { }
    };

    const deleteRule = async (id: string) => {
        if (!confirm('Hapus rule ini?')) return;
        await fetch(`/api/autoreply/${id}`, { method: 'DELETE' });
        setRules(prev => prev.filter(r => r.id !== id));
    };

    const triggerIcon = (type: string) => ({ keyword: '🔑', contains: '✍️', regex: '🔧', ai: '🤖' }[type] || '❓');

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Auto-Reply</h1>
                    <p className="page-description">Balas pesan otomatis berbasis keyword atau AI</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                    <Plus size={16} /> Tambah Rule
                </button>
            </div>

            {/* Create Form */}
            {showCreate && (
                <div className="card" style={{ marginBottom: 'var(--space-6)', borderColor: 'var(--color-border-accent)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
                        <h3 style={{ fontSize: 'var(--text-md)' }}>✨ Buat Auto-Reply Rule</h3>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setShowCreate(false); setError(''); }}><X size={16} /></button>
                    </div>
                    {error && <div style={{ padding: 'var(--space-3)', background: 'var(--color-danger-soft)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)', display: 'flex', gap: 8, alignItems: 'center' }}><AlertCircle size={16} />{error}</div>}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                        <div className="form-group">
                            <label className="form-label">Nama Rule *</label>
                            <input className="form-input" placeholder="FAQ Produk, CS AI, Sambutan, dll" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Prioritas (lebih tinggi = diproses dulu)</label>
                            <input type="number" className="form-input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: +e.target.value }))} />
                        </div>
                    </div>

                    {/* Trigger Type */}
                    <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                        <label className="form-label">Tipe Trigger</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)' }}>
                            {TRIGGER_TYPES.map(t => (
                                <div
                                    key={t.id}
                                    onClick={() => setForm(f => ({ ...f, trigger_type: t.id }))}
                                    style={{ padding: 'var(--space-3)', border: `2px solid ${form.trigger_type === t.id ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer', background: form.trigger_type === t.id ? 'var(--color-accent-soft)' : 'transparent', transition: 'all var(--transition-fast)' }}
                                >
                                    <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 2 }}>{t.label}</div>
                                    <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{t.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Keyword / Regex / Contains trigger */}
                    {form.trigger_type !== 'ai' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                            <div className="form-group">
                                <label className="form-label">{form.trigger_type === 'keyword' ? 'Kata Kunci (pisah koma untuk multiple)' : form.trigger_type === 'regex' ? 'Pattern Regex' : 'Kata yang Mengandung'}</label>
                                <input className="form-input" placeholder={form.trigger_type === 'keyword' ? 'halo, hai, selamat pagi' : form.trigger_type === 'regex' ? '^(halo|hai|hi)' : 'promo'} value={form.trigger_value} onChange={e => setForm(f => ({ ...f, trigger_value: e.target.value }))} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Pesan Balasan *</label>
                                <textarea className="form-textarea" rows={2} placeholder="Halo! Terima kasih sudah menghubungi kami..." value={form.response_text} onChange={e => setForm(f => ({ ...f, response_text: e.target.value }))} />
                            </div>
                        </div>
                    )}

                    {/* AI Config */}
                    {form.trigger_type === 'ai' && (
                        <div style={{ border: '1px solid var(--color-border-accent)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)', background: 'rgba(108,99,255,0.03)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-4)', fontWeight: 600 }}>
                                <Brain size={18} style={{ color: 'var(--color-accent)' }} /> Konfigurasi AI
                            </div>

                            {/* Provider Preset */}
                            <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                                <label className="form-label">Pilih Provider AI</label>
                                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                                    {AI_PRESETS.map(p => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            className={`btn btn-sm ${form.ai_preset === p.id ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() => handlePresetChange(p.id)}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                <div className="form-group">
                                    <label className="form-label">Base URL *</label>
                                    <input className="form-input" placeholder="https://api.sumopod.com/v1" value={form.ai_base_url} onChange={e => setForm(f => ({ ...f, ai_base_url: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">API Key *</label>
                                    <div style={{ position: 'relative' }}>
                                        <input className="form-input" type={showApiKey ? 'text' : 'password'} placeholder="sk-..." value={form.ai_api_key} onChange={e => setForm(f => ({ ...f, ai_api_key: e.target.value }))} style={{ paddingRight: 40 }} />
                                        <button type="button" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }} onClick={() => setShowApiKey(!showApiKey)}>
                                            {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Model *</label>
                                    <input className="form-input" placeholder={selectedPreset.placeholder_models[0] || 'gpt-4o-mini'} value={form.ai_model} onChange={e => setForm(f => ({ ...f, ai_model: e.target.value }))} list="model-suggestions" />
                                    <datalist id="model-suggestions">
                                        {selectedPreset.placeholder_models.map(m => <option key={m} value={m} />)}
                                    </datalist>
                                    <span className="form-hint">Contoh model: {selectedPreset.placeholder_models.slice(0, 2).join(', ')}</span>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">System Prompt (opsional)</label>
                                    <textarea className="form-textarea" rows={2} placeholder="Kamu adalah asisten WA yang sopan untuk toko XYZ. Jawab singkat dalam bahasa Indonesia." value={form.ai_system_prompt} onChange={e => setForm(f => ({ ...f, ai_system_prompt: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Temperature ({form.ai_temperature})</label>
                                    <input type="range" min={0} max={1} step={0.1} value={form.ai_temperature} onChange={e => setForm(f => ({ ...f, ai_temperature: +e.target.value }))} style={{ width: '100%' }} />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-muted)' }}><span>Konsisten (0)</span><span>Kreatif (1)</span></div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                                    <div className="form-group">
                                        <label className="form-label">Max Tokens</label>
                                        <input type="number" className="form-input" value={form.ai_max_tokens} onChange={e => setForm(f => ({ ...f, ai_max_tokens: +e.target.value }))} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Konteks (giliran)</label>
                                        <input type="number" className="form-input" min={1} max={20} value={form.ai_context_turns} onChange={e => setForm(f => ({ ...f, ai_context_turns: +e.target.value }))} />
                                        <span className="form-hint">Berapa pesan terakhir diingat AI</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary" onClick={() => { setShowCreate(false); setForm(defaultForm); }}>Batal</button>
                        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                            {saving ? <><Loader2 size={16} className="animate-spin" /> Menyimpan...</> : <><CheckCircle size={16} /> Simpan Rule</>}
                        </button>
                    </div>
                </div>
            )}

            {/* Rules List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>
                    <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto var(--space-3)' }} />Memuat rules...
                </div>
            ) : rules.length === 0 ? (
                <div className="empty-state">
                    <Bot size={48} className="empty-state-icon" />
                    <h3 className="empty-state-title">Belum ada Auto-Reply Rule</h3>
                    <p className="empty-state-description">Buat rule untuk balas pesan otomatis menggunakan keyword atau AI</p>
                    <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> Tambah Rule Pertama</button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {rules.map(rule => (
                        <div key={rule.id} className="card" style={{ padding: 'var(--space-4)', borderColor: rule.is_active ? 'var(--color-border)' : 'var(--color-border)', opacity: rule.is_active ? 1 : 0.65 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                <span style={{ fontSize: 20 }}>{triggerIcon(rule.trigger_type)}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 600 }}>{rule.name}</span>
                                        <span className={`badge ${rule.trigger_type === 'ai' ? 'badge-accent' : 'badge-default'}`}>
                                            {TRIGGER_TYPES.find(t => t.id === rule.trigger_type)?.label || rule.trigger_type}
                                        </span>
                                        {rule.ai_model && <span className="badge badge-info" style={{ fontSize: 10 }}>{rule.ai_model}</span>}
                                        <span className={`badge ${rule.is_active ? 'badge-success' : 'badge-default'}`}>{rule.is_active ? 'Aktif' : 'Nonaktif'}</span>
                                    </div>
                                    {rule.trigger_value && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>Trigger: <code style={{ fontSize: 10, background: 'var(--color-bg-tertiary)', padding: '1px 4px', borderRadius: 3 }}>{rule.trigger_value}</code></p>}
                                    {rule.trigger_type !== 'ai' && rule.response_text && (
                                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>↩ {rule.response_text}</p>
                                    )}
                                    {rule.trigger_type === 'ai' && rule.ai_system_prompt && (
                                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>🧠 {rule.ai_system_prompt}</p>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
                                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => toggleActive(rule.id, rule.is_active)} title={rule.is_active ? 'Nonaktifkan' : 'Aktifkan'} style={{ color: rule.is_active ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                                        <Power size={16} />
                                    </button>
                                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}>
                                        {expandedRule === rule.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                    <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => deleteRule(rule.id)}>
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>

                            {/* Expanded detail */}
                            {expandedRule === rule.id && (
                                <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
                                    {rule.trigger_type === 'ai' ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
                                            <div><span style={{ color: 'var(--color-text-muted)' }}>Provider URL: </span><code style={{ fontSize: 10 }}>{rule.ai_base_url}</code></div>
                                            <div><span style={{ color: 'var(--color-text-muted)' }}>Model: </span><span>{rule.ai_model}</span></div>
                                            <div><span style={{ color: 'var(--color-text-muted)' }}>System Prompt: </span><span>{rule.ai_system_prompt || '—'}</span></div>
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{rule.response_text}</div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
