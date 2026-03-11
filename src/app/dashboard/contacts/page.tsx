'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Users, Plus, Search, Upload, Tag, Trash2, MoreVertical, X, Download, Loader2, CheckCircle } from 'lucide-react';
import type { Contact } from '@/types';

export default function ContactsPage() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [formData, setFormData] = useState({ name: '', phone: '', email: '', tags: '' });
    const [submitting, setSubmitting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{total: number; imported: number; invalid: number} | null>(null);
    const csvInputRef = useRef<HTMLInputElement>(null);
    const supabase = createClient();

    useEffect(() => {
        loadContacts();
    }, []);

    const loadContacts = async () => {
        try {
            const { data } = await supabase
                .from('contacts')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);
            setContacts(data || []);
        } catch (err) {
            console.error('Error loading contacts:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddContact = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user?.id) throw new Error('User not authenticated');

            // Get tenant_id from profile since user_metadata might be stale/empty
            const { data: profile } = await supabase
                .from('profiles')
                .select('tenant_id')
                .eq('id', session.user.id)
                .single();

            const tenant_id = profile?.tenant_id;
            if (!tenant_id) throw new Error('Tenant ID not found in profile');

            let formattedPhone = formData.phone.trim();
            if (formattedPhone.startsWith('0')) formattedPhone = '62' + formattedPhone.slice(1);
            if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.slice(1);

            const tagsArray = formData.tags
                .split(',')
                .map(t => t.trim())
                .filter(t => t);

            const { error } = await supabase.from('contacts').insert({
                tenant_id,
                name: formData.name.trim(),
                phone: formattedPhone,
                email: formData.email.trim() || null,
                tags: tagsArray,
                is_valid: true
            });

            if (error) throw error;

            setShowAddModal(false);
            setFormData({ name: '', phone: '', email: '', tags: '' });
            loadContacts();
        } catch (error: any) {
            console.error('Error adding contact:', error);
            alert('Gagal menambahkan kontak: ' + (error.message || 'Unknown error'));
        } finally {
            setSubmitting(false);
        }
    };

    const filtered = contacts.filter(c =>
        (c.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery)
    );

    const downloadCSVTemplate = () => {
        const csv = 'phone,name,email,tags\n6281234567890,John Doe,john@example.com,"VIP,Customer"\n6289876543210,Jane Smith,,"Lead"';
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'template_contacts.csv'; a.click();
        URL.revokeObjectURL(url);
    };

    const handleCSVImport = async (file: File) => {
        setImporting(true); setImportResult(null);
        try {
            const text = await file.text();
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length < 2) throw new Error('File CSV kosong atau hanya header');

            // Parse header
            const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
            const phoneIdx = header.findIndex(h => ['phone', 'nomor', 'telepon', 'no', 'whatsapp', 'wa'].includes(h));
            const nameIdx = header.findIndex(h => ['name', 'nama'].includes(h));
            const emailIdx = header.findIndex(h => ['email', 'e-mail'].includes(h));
            const tagsIdx = header.findIndex(h => ['tags', 'tag', 'label'].includes(h));

            if (phoneIdx === -1) throw new Error('Kolom "phone" tidak ditemukan di CSV. Header: ' + header.join(', '));

            // Parse rows
            const contacts = [];
            for (let i = 1; i < lines.length; i++) {
                // Simple CSV parse (handles quoted fields)
                const cols = lines[i].match(/("[^"]*"|[^,]*)/g)?.map(c => c.trim().replace(/^"|"$/g, '')) || [];
                const phone = cols[phoneIdx]?.trim();
                if (!phone) continue;
                contacts.push({
                    phone,
                    name: nameIdx >= 0 ? cols[nameIdx]?.trim() || undefined : undefined,
                    email: emailIdx >= 0 ? cols[emailIdx]?.trim() || undefined : undefined,
                    tags: tagsIdx >= 0 && cols[tagsIdx] ? cols[tagsIdx].split(',').map((t: string) => t.trim()).filter(Boolean) : [],
                });
            }

            if (contacts.length === 0) throw new Error('Tidak ada data valid dalam CSV');

            const res = await fetch('/api/contacts/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contacts }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);

            setImportResult(data.data);
            loadContacts();
        } catch (err: any) {
            alert('Import gagal: ' + err.message);
        } finally {
            setImporting(false);
            if (csvInputRef.current) csvInputRef.current.value = '';
        }
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Contacts</h1>
                    <p className="page-description">Kelola daftar kontak untuk broadcast</p>
                </div>
                <div className="page-actions">
                    <button className="btn btn-ghost btn-sm" onClick={downloadCSVTemplate} title="Download template CSV">
                        <Download size={16} /> Template
                    </button>
                    <input ref={csvInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleCSVImport(f); }} />
                    <button className="btn btn-secondary" onClick={() => csvInputRef.current?.click()} disabled={importing}>
                        {importing ? <><Loader2 size={16} className="animate-spin" /> Mengimport...</> : <><Upload size={16} /> Import CSV</>}
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                        <Plus size={16} /> Tambah Kontak
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="flex items-center gap-3" style={{ marginBottom: 'var(--space-4)' }}>
                <div className="search-wrapper" style={{ maxWidth: 400 }}>
                    <Search size={16} className="search-icon" />
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Cari nama atau nomor..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                    {filtered.length} kontak
                </span>
            </div>

            {loading ? (
                <div className="card">
                    <div className="skeleton" style={{ height: 300 }} />
                </div>
            ) : contacts.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <Users size={48} className="empty-state-icon" />
                        <h3 className="empty-state-title">Belum Ada Kontak</h3>
                        <p className="empty-state-description">
                            Tambahkan kontak satu per satu atau import dari file CSV.
                        </p>
                        <div className="flex gap-3">
                            <button className="btn btn-secondary" onClick={() => csvInputRef.current?.click()} disabled={importing}>
                                <Upload size={16} /> Import CSV
                            </button>
                            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                                <Plus size={16} /> Tambah Kontak
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="table-wrapper">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Nama</th>
                                <th>Nomor Telepon</th>
                                <th>Email</th>
                                <th>Tags</th>
                                <th>Status</th>
                                <th style={{ width: 60 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(contact => (
                                <tr key={contact.id}>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <div className="avatar avatar-sm">
                                                {contact.name?.[0]?.toUpperCase() || '?'}
                                            </div>
                                            <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                                                {contact.name || '-'}
                                            </span>
                                        </div>
                                    </td>
                                    <td>{contact.phone}</td>
                                    <td>{contact.email || '-'}</td>
                                    <td>
                                        <div className="flex gap-1 flex-wrap">
                                            {contact.tags?.map((tag, i) => (
                                                <span key={i} className="tag">{tag}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td>
                                        {contact.is_valid ? (
                                            <span className="badge badge-success">Valid</span>
                                        ) : (
                                            <span className="badge badge-danger">Invalid</span>
                                        )}
                                    </td>
                                    <td>
                                        <button className="btn btn-ghost btn-icon btn-sm">
                                            <MoreVertical size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showAddModal && (
                <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
                        <div className="modal-header">
                            <h2 className="modal-title">Tambah Kontak</h2>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowAddModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleAddContact}>
                            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                                <div className="form-group">
                                    <label className="form-label">Nama</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Nomor WhatsApp</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Contoh: 6281234567890"
                                        value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        required
                                    />
                                    <p className="form-hint" style={{ marginTop: 'var(--space-1)' }}>Gunakan kode negara (62). Misalnya: 62812...</p>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Email (Opsional)</label>
                                    <input
                                        type="email"
                                        className="form-input"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Tag (Pisahkan dengan koma)</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Karyawan, VIP, dll"
                                        value={formData.tags}
                                        onChange={e => setFormData({ ...formData, tags: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="modal-footer" style={{ marginTop: 'var(--space-6)' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Batal</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? 'Menyimpan...' : 'Simpan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
