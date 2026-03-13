'use client';

import { useState, useEffect } from 'react';
import {
    ShieldCheck, Plus, Trash2, Loader2, Save, X, Info
} from 'lucide-react';

interface CustomRole {
    id: string;
    name: string;
    description: string;
    permissions: Record<string, string[]>;
    created_at: string;
}

const AVAILABLE_MODULES = [
    { id: 'dashboard', label: 'Dashboard & Analytics' },
    { id: 'broadcast', label: 'Broadcast Campaign' },
    { id: 'inbox', label: 'Inbox & Messaging' },
    { id: 'auto_reply', label: 'Auto Reply' },
    { id: 'devices', label: 'Devices' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'leads_scraper', label: 'Leads Scraper' },
    { id: 'settings', label: 'Settings & Team' },
];

export default function AdminRolesPage() {
    const [roles, setRoles] = useState<CustomRole[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');
    const [newRoleDesc, setNewRoleDesc] = useState('');
    const [newRolePerms, setNewRolePerms] = useState<Record<string, string[]>>({});
    const [isCreating, setIsCreating] = useState(false);

    const loadRoles = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/roles');
            const data = await res.json();
            if (data.success) {
                setRoles(data.data);
            } else {
                setError(data.error || 'Failed to load roles');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRoles();
    }, []);

    const togglePermission = (moduleId: string, perm: string) => {
        setNewRolePerms(prev => {
            const current = prev[moduleId] || [];
            if (current.includes(perm)) {
                return { ...prev, [moduleId]: current.filter(p => p !== perm) };
            } else {
                return { ...prev, [moduleId]: [...current, perm] };
            }
        });
    };

    const handleCreateRole = async () => {
        if (!newRoleName) return alert('Nama role wajib diisi!');
        setIsCreating(true);
        try {
            const res = await fetch('/api/admin/roles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newRoleName,
                    description: newRoleDesc,
                    permissions: newRolePerms
                })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);

            setRoles([data.data, ...roles]);
            setIsCreateModalOpen(false);
            setNewRoleName('');
            setNewRoleDesc('');
            setNewRolePerms({});
        } catch (err: any) {
            alert('Gagal membuat role: ' + err.message);
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteRole = async (id: string) => {
        if (!confirm('Hapus role ini? Pengguna yang menggunakan role ini mungkin kehilangan akses.')) return;
        try {
            const res = await fetch(`/api/admin/roles?id=${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setRoles(roles.filter(r => r.id !== id));
        } catch (err: any) {
            alert('Gagal menghapus: ' + err.message);
        }
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
        </div>
    );

    return (
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 4 }}>
                        <ShieldCheck size={22} style={{ color: 'var(--color-info)' }} />
                        <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>Custom Roles</h1>
                    </div>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                        Kelola template hak akses (Role) yang bisa digunakan oleh pelanggan untuk Agent/Member mereka.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <a href="/admin" className="btn btn-secondary btn-sm">← Kembali</a>
                    <button className="btn btn-primary btn-sm" onClick={() => setIsCreateModalOpen(true)}>
                        <Plus size={16} /> Buat Role Baru
                    </button>
                </div>
            </div>

            {error && <div className="card" style={{ color: 'var(--color-danger)', marginBottom: 'var(--space-4)', background: 'rgba(239,68,68,0.1)' }}>{error}</div>}

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: 'var(--color-bg-alt)', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                            <th style={{ padding: 'var(--space-4)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>Nama Role</th>
                            <th style={{ padding: 'var(--space-4)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>Deskripsi</th>
                            <th style={{ padding: 'var(--space-4)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>Dibuat</th>
                            <th style={{ padding: 'var(--space-4)', fontWeight: 600, fontSize: 'var(--text-sm)', textAlign: 'right' }}>Aksi</th>
                        </tr>
                    </thead>
                    <tbody>
                        {roles.map(role => (
                            <tr key={role.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                <td style={{ padding: 'var(--space-4)', fontWeight: 500 }}>{role.name}</td>
                                <td style={{ padding: 'var(--space-4)', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>{role.description || '-'}</td>
                                <td style={{ padding: 'var(--space-4)', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                                    {new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(role.created_at))}
                                </td>
                                <td style={{ padding: 'var(--space-4)', textAlign: 'right' }}>
                                    <button 
                                        onClick={() => handleDeleteRole(role.id)}
                                        style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: 'var(--space-2)' }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {roles.length === 0 && (
                            <tr>
                                <td colSpan={4} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                    Belum ada custom role yang dibuat.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 'var(--space-4)' }}>
                    <div className="card" style={{ width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
                        <button 
                            onClick={() => setIsCreateModalOpen(false)}
                            style={{ position: 'absolute', top: 'var(--space-4)', right: 'var(--space-4)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                        >
                            <X size={20} />
                        </button>
                        
                        <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-6)' }}>Buat Role Baru</h2>
                        
                        <div style={{ display: 'grid', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                            <div className="form-group">
                                <label className="form-label">Nama Role <span style={{ color: 'var(--color-danger)' }}>*</span></label>
                                <input type="text" className="form-control" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="Contoh: Manager CS" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Deskripsi</label>
                                <textarea className="form-control" value={newRoleDesc} onChange={e => setNewRoleDesc(e.target.value)} placeholder="Penjelasan singkat tugas role ini" rows={2} />
                            </div>
                        </div>

                        <div style={{ marginBottom: 'var(--space-6)' }}>
                            <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-2)' }}>Hak Akses Modul</h3>
                            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>Tentukan modul apa saja yang bisa diakses (View) dan dimanipulasi (Manage) oleh role ini.</p>
                            
                            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                                {AVAILABLE_MODULES.map(mod => (
                                    <div key={mod.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3)', background: 'var(--color-bg-alt)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                                        <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>{mod.label}</div>
                                        <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={(newRolePerms[mod.id] || []).includes('view')}
                                                    onChange={() => togglePermission(mod.id, 'view')}
                                                /> View
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={(newRolePerms[mod.id] || []).includes('manage')}
                                                    onChange={() => togglePermission(mod.id, 'manage')}
                                                /> Manage
                                            </label>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
                            <button className="btn btn-secondary" onClick={() => setIsCreateModalOpen(false)} disabled={isCreating}>Batal</button>
                            <button className="btn btn-primary" onClick={handleCreateRole} disabled={isCreating || !newRoleName}>
                                {isCreating ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Simpan Role
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
