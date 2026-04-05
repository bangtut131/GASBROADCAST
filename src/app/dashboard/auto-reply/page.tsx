'use client';

import React, { useState, useEffect } from 'react';
import {
    Bot, Plus, Zap, MessageSquare, Code, Brain,
    Trash2, Power, ChevronDown, ChevronUp, Loader2,
    AlertCircle, CheckCircle, X, Settings, Eye, EyeOff,
    Smartphone, Tag, Users, Ban, Filter, FileText, BookOpen, PlusCircle
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

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
    device_id: string | null;
    ai_model: string | null;
    ai_base_url: string | null;
    ai_system_prompt: string | null;
    target_tags: string[];
    target_group_ids: string[];
    exclude_tags: string[];
    exclude_phones: string[];
    created_at: string;
}

interface KnowledgeFile {
    id: string;
    title: string;
    category: string;
    content: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

const KB_CATEGORIES = [
    { id: 'product', label: '📦 Product Knowledge', desc: 'Info produk, harga, katalog, spesifikasi' },
    { id: 'company', label: '🏢 Company Info', desc: 'Tentang perusahaan, alamat, jam kerja' },
    { id: 'faq', label: '❓ FAQ', desc: 'Pertanyaan yang sering ditanyakan' },
    { id: 'policy', label: '📋 Policy & Rules', desc: 'Kebijakan, garansi, retur, dll' },
    { id: 'general', label: '📄 General', desc: 'Informasi umum lainnya' },
];

interface DeviceOption { id: string; name: string; phone_number: string | null; status: string; }
interface GroupOption { id: string; name: string; member_count: number; }

const defaultForm = {
    name: '', trigger_type: 'keyword', trigger_value: '',
    response_text: '', priority: 0,
    device_id: '',
    ai_preset: 'sumopod', ai_base_url: 'https://api.sumopod.com/v1',
    ai_api_key: '', ai_model: '', ai_system_prompt: '', ai_temperature: 0.7,
    ai_max_tokens: 512, ai_context_turns: 5,
    // Filters
    target_tags: [] as string[],
    target_group_ids: [] as string[],
    exclude_tags: [] as string[],
    exclude_phones: '',
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
    const [showFilters, setShowFilters] = useState(false);

    // Data for dropdowns
    const [devices, setDevices] = useState<DeviceOption[]>([]);
    const [groups, setGroups] = useState<GroupOption[]>([]);
    const [allTags, setAllTags] = useState<string[]>([]);

    // Knowledge Base
    const [knowledgeMap, setKnowledgeMap] = useState<Record<string, KnowledgeFile[]>>({});
    const [kbForm, setKbForm] = useState({ title: '', category: 'product', content: '' });
    const [kbSaving, setKbSaving] = useState(false);
    const [kbRuleId, setKbRuleId] = useState<string | null>(null);

    useEffect(() => { loadRules(); loadFilterData(); }, []);

    const loadRules = async () => {
        try {
            const res = await fetch('/api/autoreply');
            const data = await res.json();
            if (data.success) setRules(data.data);
        } catch { } finally { setLoading(false); }
    };

    const loadFilterData = async () => {
        try {
            const supabase = createClient();

            // Load devices
            const { data: devs } = await supabase
                .from('devices')
                .select('id, name, phone_number, status')
                .order('name');
            setDevices(devs || []);

            // Load groups
            const grpRes = await fetch('/api/contacts/groups');
            const grpData = await grpRes.json();
            if (grpData.success) setGroups(grpData.data || []);

            // Load all unique tags from contacts
            const { data: contacts } = await supabase
                .from('contacts')
                .select('tags');
            const tagSet = new Set<string>();
            (contacts || []).forEach(c => (c.tags || []).forEach((t: string) => tagSet.add(t)));
            setAllTags(Array.from(tagSet).sort());
        } catch (err) {
            console.error('Failed to load filter data:', err);
        }
    };

    const handlePresetChange = (presetId: string) => {
        const preset = AI_PRESETS.find(p => p.id === presetId);
        if (preset) {
            setForm(f => ({ ...f, ai_preset: presetId, ai_base_url: preset.baseUrl, ai_model: '' }));
        }
    };

    const selectedPreset = AI_PRESETS.find(p => p.id === form.ai_preset) || AI_PRESETS[0];

    const toggleTag = (tag: string, field: 'target_tags' | 'exclude_tags') => {
        setForm(f => ({
            ...f,
            [field]: f[field].includes(tag)
                ? f[field].filter(t => t !== tag)
                : [...f[field], tag]
        }));
    };

    const toggleGroup = (groupId: string) => {
        setForm(f => ({
            ...f,
            target_group_ids: f.target_group_ids.includes(groupId)
                ? f.target_group_ids.filter(g => g !== groupId)
                : [...f.target_group_ids, groupId]
        }));
    };

    // Knowledge Base functions
    const loadKnowledge = async (ruleId: string) => {
        try {
            const res = await fetch(`/api/autoreply/${ruleId}/knowledge`);
            const data = await res.json();
            if (data.success) {
                setKnowledgeMap(prev => ({ ...prev, [ruleId]: data.data }));
            }
        } catch { }
    };

    const addKnowledge = async (ruleId: string) => {
        if (!kbForm.title || !kbForm.content) return;
        setKbSaving(true);
        try {
            const res = await fetch(`/api/autoreply/${ruleId}/knowledge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(kbForm),
            });
            const data = await res.json();
            if (data.success) {
                setKnowledgeMap(prev => ({
                    ...prev,
                    [ruleId]: [...(prev[ruleId] || []), data.data]
                }));
                setKbForm({ title: '', category: 'product', content: '' });
            }
        } catch { }
        finally { setKbSaving(false); }
    };

    const toggleKnowledge = async (ruleId: string, fileId: string, current: boolean) => {
        try {
            await fetch(`/api/autoreply/${ruleId}/knowledge/${fileId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !current }),
            });
            setKnowledgeMap(prev => ({
                ...prev,
                [ruleId]: (prev[ruleId] || []).map(f =>
                    f.id === fileId ? { ...f, is_active: !current } : f
                )
            }));
        } catch { }
    };

    const deleteKnowledge = async (ruleId: string, fileId: string) => {
        if (!confirm('Hapus knowledge file ini?')) return;
        try {
            await fetch(`/api/autoreply/${ruleId}/knowledge/${fileId}`, { method: 'DELETE' });
            setKnowledgeMap(prev => ({
                ...prev,
                [ruleId]: (prev[ruleId] || []).filter(f => f.id !== fileId)
            }));
        } catch { }
    };

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
                device_id: form.device_id || null,
                // Filters
                target_tags: form.target_tags,
                target_group_ids: form.target_group_ids,
                exclude_tags: form.exclude_tags,
                exclude_phones: form.exclude_phones
                    ? form.exclude_phones.split(',').map(p => p.trim()).filter(Boolean)
                    : [],
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
            setShowFilters(false);
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

    // Helper to count active filters
    const countActiveFilters = () => {
        let c = 0;
        if (form.device_id) c++;
        if (form.target_tags.length > 0) c++;
        if (form.target_group_ids.length > 0) c++;
        if (form.exclude_tags.length > 0) c++;
        if (form.exclude_phones.trim()) c++;
        return c;
    };

    // Helper to render filter badges for a rule card
    const renderFilterBadges = (rule: AutoReplyRule) => {
        const badges: React.ReactNode[] = [];
        if (rule.device_id) {
            const dev = devices.find(d => d.id === rule.device_id);
            badges.push(<span key="dev" className="badge badge-info" style={{ fontSize: 10 }}>📱 {dev?.name || 'Device'}</span>);
        }
        if (rule.target_tags?.length > 0) {
            badges.push(<span key="ttag" className="badge badge-info" style={{ fontSize: 10 }}>🏷️ {rule.target_tags.join(', ')}</span>);
        }
        if (rule.target_group_ids?.length > 0) {
            const gNames = rule.target_group_ids.map(gid => groups.find(g => g.id === gid)?.name || 'Grup').join(', ');
            badges.push(<span key="tgrp" className="badge badge-info" style={{ fontSize: 10 }}>👥 {gNames}</span>);
        }
        if (rule.exclude_tags?.length > 0) {
            badges.push(<span key="extag" className="badge badge-default" style={{ fontSize: 10 }}>🚫 {rule.exclude_tags.join(', ')}</span>);
        }
        if (rule.exclude_phones?.length > 0) {
            badges.push(<span key="exph" className="badge badge-default" style={{ fontSize: 10 }}>🚫 {rule.exclude_phones.length} nomor</span>);
        }
        return badges;
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Auto-Reply</h1>
                    <p className="page-description">Balas pesan otomatis berbasis keyword atau AI — dengan filter per device, tag, dan grup</p>
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
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setShowCreate(false); setError(''); setShowFilters(false); }}><X size={16} /></button>
                    </div>
                    {error && <div style={{ padding: 'var(--space-3)', background: 'var(--color-danger-soft)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)', display: 'flex', gap: 8, alignItems: 'center' }}><AlertCircle size={16} />{error}</div>}

                    {/* Row 1: Name + Priority */}
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

                    {/* Row 2: Device Selector */}
                    <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                        <label className="form-label"><Smartphone size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Device</label>
                        <select
                            className="form-input"
                            value={form.device_id}
                            onChange={e => setForm(f => ({ ...f, device_id: e.target.value }))}
                        >
                            <option value="">🌐 Semua Device</option>
                            {devices.map(d => (
                                <option key={d.id} value={d.id}>
                                    {d.name} {d.phone_number ? `(${d.phone_number})` : ''} — {d.status === 'connected' ? '🟢' : '🔴'}
                                </option>
                            ))}
                        </select>
                        <span className="form-hint">Kosong = rule berlaku untuk semua device</span>
                    </div>

                    {/* Filters Toggle */}
                    <div style={{ marginBottom: 'var(--space-4)' }}>
                        <button
                            type="button"
                            className={`btn btn-sm ${showFilters || countActiveFilters() > 0 ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setShowFilters(!showFilters)}
                            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                            <Filter size={14} />
                            {showFilters ? 'Sembunyikan' : 'Tampilkan'} Filter Lanjutan
                            {countActiveFilters() > 0 && (
                                <span style={{
                                    background: 'var(--color-accent)', color: '#fff',
                                    borderRadius: '50%', width: 18, height: 18, fontSize: 10,
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700
                                }}>{countActiveFilters()}</span>
                            )}
                        </button>
                    </div>

                    {/* Advanced Filters Panel */}
                    {showFilters && (
                        <div style={{
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-lg)',
                            padding: 'var(--space-4)',
                            marginBottom: 'var(--space-4)',
                            background: 'var(--color-bg-secondary)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-4)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                                <Filter size={16} style={{ color: 'var(--color-accent)' }} /> Filter Lanjutan
                                <span style={{ fontWeight: 400, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                                    (Jika target tag DAN grup diisi, keduanya harus cocok — AND logic)
                                </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                                {/* Target Tags */}
                                <div className="form-group">
                                    <label className="form-label">
                                        <Tag size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                                        🎯 Target Tag Kontak
                                    </label>
                                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
                                        Hanya reply ke kontak yang punya tag ini. Kosong = semua.
                                    </p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                                        {allTags.length === 0 && (
                                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                                                Belum ada tag di kontak
                                            </span>
                                        )}
                                        {allTags.map(tag => (
                                            <button
                                                key={tag}
                                                type="button"
                                                onClick={() => toggleTag(tag, 'target_tags')}
                                                className={`btn btn-sm ${form.target_tags.includes(tag) ? 'btn-primary' : 'btn-secondary'}`}
                                                style={{ fontSize: 11, padding: '2px 8px' }}
                                            >
                                                {form.target_tags.includes(tag) ? '✓ ' : ''}{tag}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Target Groups */}
                                <div className="form-group">
                                    <label className="form-label">
                                        <Users size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                                        🎯 Target Grup Broadcast
                                    </label>
                                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
                                        Hanya reply ke kontak yang ada di grup ini. Kosong = semua.
                                    </p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                                        {groups.length === 0 && (
                                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                                                Belum ada grup broadcast
                                            </span>
                                        )}
                                        {groups.map(grp => (
                                            <button
                                                key={grp.id}
                                                type="button"
                                                onClick={() => toggleGroup(grp.id)}
                                                className={`btn btn-sm ${form.target_group_ids.includes(grp.id) ? 'btn-primary' : 'btn-secondary'}`}
                                                style={{ fontSize: 11, padding: '2px 8px' }}
                                            >
                                                {form.target_group_ids.includes(grp.id) ? '✓ ' : ''}{grp.name} ({grp.member_count})
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Exclude Tags */}
                                <div className="form-group">
                                    <label className="form-label">
                                        <Ban size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                                        🚫 Exclude Tag
                                    </label>
                                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
                                        Jangan reply ke kontak dengan tag ini.
                                    </p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
                                        {allTags.length === 0 && (
                                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                                                Belum ada tag di kontak
                                            </span>
                                        )}
                                        {allTags.map(tag => (
                                            <button
                                                key={tag}
                                                type="button"
                                                onClick={() => toggleTag(tag, 'exclude_tags')}
                                                className={`btn btn-sm ${form.exclude_tags.includes(tag) ? 'btn-danger' : 'btn-secondary'}`}
                                                style={{ fontSize: 11, padding: '2px 8px' }}
                                            >
                                                {form.exclude_tags.includes(tag) ? '✕ ' : ''}{tag}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Exclude Phones */}
                                <div className="form-group">
                                    <label className="form-label">
                                        <Ban size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                                        🚫 Exclude Nomor
                                    </label>
                                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
                                        Pisah dengan koma. Kontak di blacklist otomatis terexclude.
                                    </p>
                                    <input
                                        className="form-input"
                                        placeholder="628123456789, 628987654321"
                                        value={form.exclude_phones}
                                        onChange={e => setForm(f => ({ ...f, exclude_phones: e.target.value }))}
                                    />
                                </div>
                            </div>

                            {/* Quick summary */}
                            {countActiveFilters() > 0 && (
                                <div style={{
                                    marginTop: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)',
                                    background: 'var(--color-accent-soft)', borderRadius: 'var(--radius-md)',
                                    fontSize: 'var(--text-xs)', color: 'var(--color-accent)',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}>
                                    <CheckCircle size={13} />
                                    <span>
                                        {form.device_id ? `Device: ${devices.find(d => d.id === form.device_id)?.name || 'Selected'}` : ''}
                                        {form.target_tags.length > 0 ? ` • Tag: ${form.target_tags.join(', ')}` : ''}
                                        {form.target_group_ids.length > 0 ? ` • Grup: ${form.target_group_ids.map(gid => groups.find(g => g.id === gid)?.name).join(', ')}` : ''}
                                        {form.exclude_tags.length > 0 ? ` • Exclude tag: ${form.exclude_tags.join(', ')}` : ''}
                                        {form.exclude_phones.trim() ? ` • Exclude ${form.exclude_phones.split(',').filter(Boolean).length} nomor` : ''}
                                        {' '}+ blacklist otomatis
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

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
                                    <label className="form-label">System Prompt / Guardrails</label>
                                    <textarea className="form-textarea" rows={3} placeholder="Kamu adalah CS toko XYZ. Jawab HANYA berdasarkan Knowledge Base yang tersedia. Jika tidak tahu jawabannya, minta customer menghubungi CS di 08xxx. Jawab singkat dan sopan dalam bahasa Indonesia. Jangan jawab pertanyaan di luar topik bisnis." value={form.ai_system_prompt} onChange={e => setForm(f => ({ ...f, ai_system_prompt: e.target.value }))} />
                                    <span className="form-hint">Tulis instruksi & guardrails untuk AI agent. Knowledge Base (produk, perusahaan, FAQ) bisa ditambahkan setelah rule disimpan.</span>
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

                            {/* Knowledge Base Note */}
                            <div style={{
                                marginTop: 'var(--space-4)', padding: 'var(--space-3)',
                                background: 'var(--color-bg-secondary)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px dashed var(--color-border)',
                                display: 'flex', alignItems: 'center', gap: 8,
                                fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)',
                            }}>
                                <BookOpen size={16} style={{ flexShrink: 0, color: 'var(--color-accent)' }} />
                                <span>
                                    <strong>Knowledge Base</strong> — Setelah rule disimpan, Anda bisa menambahkan file knowledge
                                    (Product Knowledge, Company Info, FAQ, dll) di detail rule. AI akan menggunakan knowledge tersebut sebagai referensi jawaban.
                                </span>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary" onClick={() => { setShowCreate(false); setForm(defaultForm); setShowFilters(false); }}>Batal</button>
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
                    {/* Info banner */}
                    <div style={{
                        padding: 'var(--space-3) var(--space-4)',
                        background: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-muted)',
                        display: 'flex', alignItems: 'center', gap: 8,
                        border: '1px solid var(--color-border)',
                    }}>
                        <AlertCircle size={14} />
                        <span>
                            Rule diproses berurutan dari prioritas tertinggi. Rule pertama yang cocok akan dieksekusi.
                            Kontak di <strong>blacklist</strong> otomatis tidak akan mendapat auto-reply.
                        </span>
                    </div>

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
                                        <span className="badge badge-default" style={{ fontSize: 10 }}>P:{rule.priority}</span>
                                    </div>
                                    {/* Filter badges */}
                                    {renderFilterBadges(rule).length > 0 && (
                                        <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap', marginTop: 4 }}>
                                            {renderFilterBadges(rule)}
                                        </div>
                                    )}
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
                                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => {
                                        const newExpanded = expandedRule === rule.id ? null : rule.id;
                                        setExpandedRule(newExpanded);
                                        if (newExpanded && rule.trigger_type === 'ai' && !knowledgeMap[rule.id]) {
                                            loadKnowledge(rule.id);
                                        }
                                    }}>
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
                                    {/* Filter details */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
                                        <div>
                                            <span style={{ color: 'var(--color-text-muted)' }}>Device: </span>
                                            <span>{rule.device_id ? (devices.find(d => d.id === rule.device_id)?.name || rule.device_id) : '🌐 Semua'}</span>
                                        </div>
                                        <div>
                                            <span style={{ color: 'var(--color-text-muted)' }}>Target Tags: </span>
                                            <span>{rule.target_tags?.length > 0 ? rule.target_tags.join(', ') : '— Semua'}</span>
                                        </div>
                                        <div>
                                            <span style={{ color: 'var(--color-text-muted)' }}>Target Grup: </span>
                                            <span>{rule.target_group_ids?.length > 0 ? rule.target_group_ids.map(gid => groups.find(g => g.id === gid)?.name || gid).join(', ') : '— Semua'}</span>
                                        </div>
                                        <div>
                                            <span style={{ color: 'var(--color-text-muted)' }}>Exclude Tags: </span>
                                            <span>{rule.exclude_tags?.length > 0 ? rule.exclude_tags.join(', ') : '— Tidak ada'}</span>
                                        </div>
                                        <div>
                                            <span style={{ color: 'var(--color-text-muted)' }}>Exclude Phones: </span>
                                            <span>{rule.exclude_phones?.length > 0 ? rule.exclude_phones.join(', ') : '— Tidak ada'}</span>
                                        </div>
                                        <div>
                                            <span style={{ color: 'var(--color-text-muted)' }}>Blacklist: </span>
                                            <span style={{ color: 'var(--color-success)' }}>✓ Otomatis terexclude</span>
                                        </div>
                                    </div>

                                    {rule.trigger_type === 'ai' ? (
                                        <>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>
                                                <div><span style={{ color: 'var(--color-text-muted)' }}>Provider URL: </span><code style={{ fontSize: 10 }}>{rule.ai_base_url}</code></div>
                                                <div><span style={{ color: 'var(--color-text-muted)' }}>Model: </span><span>{rule.ai_model}</span></div>
                                                <div><span style={{ color: 'var(--color-text-muted)' }}>System Prompt: </span><span>{rule.ai_system_prompt || '—'}</span></div>
                                            </div>

                                            {/* === KNOWLEDGE BASE MANAGER === */}
                                            <div style={{
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-lg)',
                                                padding: 'var(--space-4)',
                                                background: 'var(--color-bg-secondary)',
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                                                        <BookOpen size={16} style={{ color: 'var(--color-accent)' }} />
                                                        Knowledge Base
                                                        <span className="badge badge-default" style={{ fontSize: 10 }}>
                                                            {(knowledgeMap[rule.id] || []).filter(f => f.is_active).length} file aktif
                                                        </span>
                                                    </div>
                                                    <button
                                                        className="btn btn-sm btn-primary"
                                                        onClick={() => setKbRuleId(kbRuleId === rule.id ? null : rule.id)}
                                                        style={{ fontSize: 11 }}
                                                    >
                                                        <PlusCircle size={13} /> Tambah File
                                                    </button>
                                                </div>

                                                {/* Add Knowledge Form */}
                                                {kbRuleId === rule.id && (
                                                    <div style={{
                                                        padding: 'var(--space-3)',
                                                        marginBottom: 'var(--space-3)',
                                                        background: 'var(--color-bg-primary)',
                                                        borderRadius: 'var(--radius-md)',
                                                        border: '1px solid var(--color-border-accent)',
                                                    }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                                                            <div className="form-group">
                                                                <label className="form-label" style={{ fontSize: 12 }}>Judul *</label>
                                                                <input
                                                                    className="form-input"
                                                                    placeholder="Katalog Produk 2024, Info Perusahaan, dll"
                                                                    value={kbForm.title}
                                                                    onChange={e => setKbForm(f => ({ ...f, title: e.target.value }))}
                                                                />
                                                            </div>
                                                            <div className="form-group">
                                                                <label className="form-label" style={{ fontSize: 12 }}>Kategori</label>
                                                                <select
                                                                    className="form-input"
                                                                    value={kbForm.category}
                                                                    onChange={e => setKbForm(f => ({ ...f, category: e.target.value }))}
                                                                >
                                                                    {KB_CATEGORIES.map(c => (
                                                                        <option key={c.id} value={c.id}>{c.label}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </div>
                                                        <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
                                                            <label className="form-label" style={{ fontSize: 12 }}>Konten Knowledge *</label>
                                                            <textarea
                                                                className="form-textarea"
                                                                rows={6}
                                                                placeholder={`Contoh untuk Product Knowledge:

1. Kaos Polos Premium
   - Bahan: Cotton Combed 30s
   - Warna: Hitam, Putih, Navy, Abu
   - Ukuran: S, M, L, XL, XXL
   - Harga: Rp 89.000
   - Stok: Tersedia

2. Kemeja Flannel
   - Bahan: Cotton Flannel
   - Harga: Rp 159.000
   - Stok: Tersedia`}
                                                                value={kbForm.content}
                                                                onChange={e => setKbForm(f => ({ ...f, content: e.target.value }))}
                                                            />
                                                            <span className="form-hint">
                                                                Tulis informasi selengkap mungkin. AI akan menggunakan ini sebagai referensi utama untuk menjawab pertanyaan.
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                                                            <button className="btn btn-sm btn-secondary" onClick={() => { setKbRuleId(null); setKbForm({ title: '', category: 'product', content: '' }); }}>Batal</button>
                                                            <button
                                                                className="btn btn-sm btn-primary"
                                                                onClick={() => addKnowledge(rule.id)}
                                                                disabled={kbSaving || !kbForm.title || !kbForm.content}
                                                            >
                                                                {kbSaving ? <><Loader2 size={13} className="animate-spin" /> Menyimpan...</> : <><CheckCircle size={13} /> Simpan</>}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Knowledge Files List */}
                                                {(knowledgeMap[rule.id] || []).length === 0 ? (
                                                    <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                                                        <FileText size={24} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
                                                        <p>Belum ada file knowledge. Tambahkan product knowledge, company info, atau FAQ agar AI agent lebih pintar.</p>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                                        {(knowledgeMap[rule.id] || []).map(file => (
                                                            <div
                                                                key={file.id}
                                                                style={{
                                                                    display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
                                                                    padding: 'var(--space-3)',
                                                                    background: 'var(--color-bg-primary)',
                                                                    borderRadius: 'var(--radius-md)',
                                                                    border: '1px solid var(--color-border)',
                                                                    opacity: file.is_active ? 1 : 0.55,
                                                                }}
                                                            >
                                                                <FileText size={18} style={{ flexShrink: 0, color: 'var(--color-accent)', marginTop: 2 }} />
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                                                                        <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{file.title}</span>
                                                                        <span className="badge badge-accent" style={{ fontSize: 9 }}>
                                                                            {KB_CATEGORIES.find(c => c.id === file.category)?.label || file.category}
                                                                        </span>
                                                                        <span className={`badge ${file.is_active ? 'badge-success' : 'badge-default'}`} style={{ fontSize: 9 }}>
                                                                            {file.is_active ? 'Aktif' : 'Nonaktif'}
                                                                        </span>
                                                                    </div>
                                                                    <p style={{
                                                                        fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)',
                                                                        marginTop: 2, whiteSpace: 'pre-wrap',
                                                                        maxHeight: 60, overflow: 'hidden',
                                                                    }}>
                                                                        {file.content.substring(0, 200)}{file.content.length > 200 ? '...' : ''}
                                                                    </p>
                                                                    <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>
                                                                        {file.content.length.toLocaleString()} karakter
                                                                    </div>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: 'var(--space-1)', flexShrink: 0 }}>
                                                                    <button
                                                                        className="btn btn-ghost btn-icon btn-sm"
                                                                        onClick={() => toggleKnowledge(rule.id, file.id, file.is_active)}
                                                                        title={file.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                                                                        style={{ color: file.is_active ? 'var(--color-success)' : 'var(--color-text-muted)' }}
                                                                    >
                                                                        <Power size={14} />
                                                                    </button>
                                                                    <button
                                                                        className="btn btn-ghost btn-icon btn-sm"
                                                                        style={{ color: 'var(--color-danger)' }}
                                                                        onClick={() => deleteKnowledge(rule.id, file.id)}
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </>
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
