'use client';

import { useState, useEffect } from 'react';
import {
    Key, Plus, Copy, Eye, EyeOff, Trash2, Shield,
    CheckCircle, AlertCircle, Loader2, X
} from 'lucide-react';

interface ApiKey {
    id: string;
    name: string;
    key_prefix: string;
    permissions: string[];
    is_active: boolean;
    last_used_at: string | null;
    created_at: string;
}

const ALL_PERMISSIONS = [
    { id: 'send_message', label: 'Kirim Pesan', desc: 'Kirim WA message via API' },
    { id: 'read_contacts', label: 'Baca Kontak', desc: 'Ambil data kontak' },
    { id: 'write_contacts', label: 'Tulis Kontak', desc: 'Tambah/update kontak' },
    { id: 'read_campaigns', label: 'Baca Campaign', desc: 'Lihat data campaign' },
];

export default function ApiKeysPage() {
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [selectedPerms, setSelectedPerms] = useState(['send_message', 'read_contacts']);
    const [creating, setCreating] = useState(false);
    const [newKey, setNewKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { loadKeys(); }, []);

    const loadKeys = async () => {
        try {
            const res = await fetch('/api/api-keys');
            const data = await res.json();
            if (data.success) setKeys(data.data);
        } catch { } finally { setLoading(false); }
    };

    const handleCreate = async () => {
        if (!newKeyName.trim()) { setError('Nama key wajib diisi'); return; }
        setCreating(true); setError('');
        try {
            const res = await fetch('/api/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newKeyName, permissions: selectedPerms }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setNewKey(data.data.key);
            setKeys(prev => [data.data, ...prev]);
            setNewKeyName('');
        } catch (err: any) { setError(err.message); }
        finally { setCreating(false); }
    };

    const handleRevoke = async (id: string) => {
        if (!confirm('Yakin ingin menonaktifkan API key ini?')) return;
        try {
            await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
            setKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: false } : k));
        } catch { }
    };

    const copyKey = () => {
        if (newKey) {
            navigator.clipboard.writeText(newKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const togglePerm = (perm: string) => {
        setSelectedPerms(prev => prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]);
    };

    const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Belum pernah';

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">API Keys</h1>
                    <p className="page-description">Kelola akses REST API untuk integrasi eksternal</p>
                </div>
                <button className="btn btn-primary" onClick={() => { setShowCreate(true); setNewKey(null); }}>
                    <Plus size={16} /> Generate API Key
                </button>
            </div>

            {/* API Docs info */}
            <div style={{ padding: 'var(--space-4)', background: 'var(--color-accent-soft)', border: '1px solid var(--color-border-accent)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-6)', display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start' }}>
                <Shield size={20} style={{ color: 'var(--color-accent)', flexShrink: 0, marginTop: 2 }} />
                <div>
                    <div style={{ fontWeight: 600, marginBottom: 'var(--space-1)' }}>REST API tersedia di <code style={{ background: 'var(--color-bg-tertiary)', padding: '2px 8px', borderRadius: 4, fontSize: 'var(--text-xs)' }}>/api/v1</code></div>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
                        Gunakan header <code style={{ fontSize: 'var(--text-xs)' }}>Authorization: Bearer {'<api_key>'}</code> atau <code style={{ fontSize: 'var(--text-xs)' }}>X-Api-Key: {'<api_key>'}</code>
                        <br />Endpoints: <code style={{ fontSize: 'var(--text-xs)' }}>POST /api/v1/messages/send</code> · <code style={{ fontSize: 'var(--text-xs)' }}>GET /api/v1/contacts</code> · <code style={{ fontSize: 'var(--text-xs)' }}>POST /api/v1/contacts</code>
                    </p>
                </div>
            </div>

            {/* Create form */}
            {showCreate && !newKey && (
                <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                        <h3 style={{ fontSize: 'var(--text-md)' }}>Buat API Key Baru</h3>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowCreate(false)}><X size={16} /></button>
                    </div>
                    {error && <div style={{ padding: 'var(--space-3)', background: 'var(--color-danger-soft)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>{error}</div>}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
                        <div className="form-group">
                            <label className="form-label">Nama Key *</label>
                            <input type="text" className="form-input" placeholder="Production App, Testing, dll" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} />
                        </div>
                        <div>
                            <label className="form-label" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>Permissions</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                {ALL_PERMISSIONS.map(p => (
                                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
                                        <input type="checkbox" checked={selectedPerms.includes(p.id)} onChange={() => togglePerm(p.id)} />
                                        <span style={{ fontWeight: 500 }}>{p.label}</span>
                                        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>— {p.desc}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
                        <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Batal</button>
                        <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
                            {creating ? <><Loader2 size={16} className="animate-spin" /> Generating...</> : <><Key size={16} /> Generate Key</>}
                        </button>
                    </div>
                </div>
            )}

            {/* New key reveal */}
            {newKey && (
                <div className="card" style={{ marginBottom: 'var(--space-6)', borderColor: 'var(--color-success)' }}>
                    <div className="flex items-center gap-3" style={{ marginBottom: 'var(--space-3)' }}>
                        <CheckCircle size={20} style={{ color: 'var(--color-success)' }} />
                        <h3 style={{ fontSize: 'var(--text-md)' }}>API Key Berhasil Dibuat!</h3>
                    </div>
                    <div style={{ padding: 'var(--space-3)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', fontFamily: 'monospace', fontSize: 'var(--text-sm)', wordBreak: 'break-all', marginBottom: 'var(--space-3)', border: '1px solid var(--color-border)' }}>
                        {newKey}
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                        <button className="btn btn-secondary btn-sm" onClick={copyKey}>
                            {copied ? <><CheckCircle size={14} /> Tersalin!</> : <><Copy size={14} /> Salin Key</>}
                        </button>
                        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                            <AlertCircle size={14} /> Simpan sekarang! Key tidak akan ditampilkan lagi.
                        </span>
                    </div>
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: 'var(--space-3)' }} onClick={() => { setNewKey(null); setShowCreate(false); }}>
                        Tutup
                    </button>
                </div>
            )}

            {/* Keys table */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>
                    <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto var(--space-3)' }} />
                    <p>Memuat API Keys...</p>
                </div>
            ) : keys.length === 0 ? (
                <div className="empty-state">
                    <Key size={48} className="empty-state-icon" />
                    <h3 className="empty-state-title">Belum ada API Key</h3>
                    <p className="empty-state-description">Generate API key pertama untuk mulai menggunakan REST API</p>
                    <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> Generate API Key</button>
                </div>
            ) : (
                <div className="table-wrapper">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Nama</th>
                                <th>Prefix</th>
                                <th>Permissions</th>
                                <th>Terakhir Digunakan</th>
                                <th>Dibuat</th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {keys.map(key => (
                                <tr key={key.id}>
                                    <td style={{ fontWeight: 500 }}>{key.name}</td>
                                    <td><code style={{ fontSize: 'var(--text-xs)', background: 'var(--color-bg-tertiary)', padding: '2px 8px', borderRadius: 4 }}>{key.key_prefix}...</code></td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                            {key.permissions.map(p => (
                                                <span key={p} className="badge badge-accent" style={{ fontSize: 10 }}>{p.replace('_', ' ')}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{formatDate(key.last_used_at)}</td>
                                    <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{formatDate(key.created_at)}</td>
                                    <td>
                                        <span className={`badge ${key.is_active ? 'badge-success' : 'badge-default'}`}>
                                            {key.is_active ? 'Aktif' : 'Nonaktif'}
                                        </span>
                                    </td>
                                    <td>
                                        {key.is_active && (
                                            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => handleRevoke(key.id)} title="Nonaktifkan">
                                                <Trash2 size={15} />
                                            </button>
                                        )}
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
