'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Users, Plus, Search, Upload, Tag, Trash2, Edit3, MoreVertical, X, Download, Loader2, CheckCircle, ShieldAlert, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { Contact } from '@/types';

export default function ContactsPage() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    
    // Modal states
    const [showContactModal, setShowContactModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({ name: '', phone: '', email: '', tags: '' });
    const [submitting, setSubmitting] = useState(false);
    
    // Import states
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{total: number; imported: number; invalid: number} | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const supabase = createClient();

    useEffect(() => {
        loadContacts();
    }, []);

    const loadContacts = async () => {
        try {
            const { data } = await supabase
                .from('contacts')
                .select('*')
                .order('created_at', { ascending: false });
            setContacts(data || []);
            // reset selection when data reload
            setSelectedIds(new Set());
        } catch (err) {
            console.error('Error loading contacts:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveContact = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user?.id) throw new Error('User not authenticated');

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
                .filter(Boolean);

            if (editingId) {
                // Update
                const { error } = await supabase.from('contacts').update({
                    name: formData.name.trim(),
                    phone: formattedPhone,
                    email: formData.email.trim() || null,
                    tags: tagsArray,
                }).eq('id', editingId).eq('tenant_id', tenant_id);
                if (error) throw error;
            } else {
                // Insert
                const { error } = await supabase.from('contacts').insert({
                    tenant_id,
                    name: formData.name.trim(),
                    phone: formattedPhone,
                    email: formData.email.trim() || null,
                    tags: tagsArray,
                    is_valid: true
                });
                if (error) throw error;
            }

            setShowContactModal(false);
            setEditingId(null);
            setFormData({ name: '', phone: '', email: '', tags: '' });
            loadContacts();
        } catch (error: any) {
            console.error('Error saving contact:', error);
            alert(`Gagal menyimpan kontak: ${error.message || 'Unknown error'}`);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteContact = async (id: string) => {
        if (!confirm('Yakin ingin menghapus kontak ini?')) return;
        try {
            const { error } = await supabase.from('contacts').delete().eq('id', id);
            if (error) throw error;
            loadContacts();
        } catch (err: any) {
            alert('Gagal menghapus: ' + err.message);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Yakin ingin menghapus ${selectedIds.size} kontak terpilih?`)) return;

        setLoading(true);
        try {
            const idsToDelete = Array.from(selectedIds);
            const { error } = await supabase.from('contacts').delete().in('id', idsToDelete);
            if (error) throw error;
            loadContacts();
        } catch (err: any) {
            alert('Gagal menghapus kontak massal: ' + err.message);
            setLoading(false);
        }
    };

    const openEditModal = (contact: Contact) => {
        setEditingId(contact.id);
        setFormData({
            name: contact.name || '',
            phone: contact.phone,
            email: contact.email || '',
            tags: (contact.tags || []).join(', ')
        });
        setShowContactModal(true);
    };

    const openAddModal = () => {
        setEditingId(null);
        setFormData({ name: '', phone: '', email: '', tags: '' });
        setShowContactModal(true);
    };

    const allCategories = Array.from(new Set(contacts.flatMap(c => c.tags || []))).sort();

    const filtered = contacts.filter(c => {
        const matchesSearch = (c.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || c.phone.includes(searchQuery);
        const matchesCategory = selectedCategory ? c.tags?.includes(selectedCategory) : true;
        return matchesSearch && matchesCategory;
    });

    const isAllSelected = filtered.length > 0 && selectedIds.size === filtered.length;
    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filtered.map(c => c.id)));
        }
    };

    const toggleSelectRow = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const downloadExcelTemplate = () => {
        const ws = XLSX.utils.aoa_to_sheet([
            ['Nomor Telepon', 'Nama', 'Email', 'Kategori'],
            ['6281234567890', 'John Doe', 'john@example.com', 'VIP,Customer'],
            ['6289876543210', 'Jane Smith', '', 'Lead']
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template Kontak");
        XLSX.writeFile(wb, "template_kontak.xlsx");
    };

    const handleExcelImport = async (file: File) => {
        setImporting(true); setImportResult(null);
        try {
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

            if (data.length < 2) throw new Error('File Excel kosong atau hanya berisi header');

            const header = (data[0] || []).map((h: string) => String(h).toLowerCase().trim());
            const phoneIdx = header.findIndex(h => ['nomor telepon', 'phone', 'nomor wa', 'whatsapp', 'no'].includes(h));
            const nameIdx = header.findIndex(h => ['nama', 'name'].includes(h));
            const emailIdx = header.findIndex(h => ['email', 'surel'].includes(h));
            const tagsIdx = header.findIndex(h => ['kategori', 'kategori / label', 'tags', 'tag', 'label'].includes(h));

            if (phoneIdx === -1) throw new Error('Kolom "Nomor Telepon" tidak ditemukan di baris pertama Excel.');

            const imports = [];
            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                if (!row || row.length === 0) continue;
                
                const phone = row[phoneIdx] ? String(row[phoneIdx]).trim() : undefined;
                if (!phone) continue;

                imports.push({
                    phone,
                    name: nameIdx >= 0 && row[nameIdx] ? String(row[nameIdx]).trim() : undefined,
                    email: emailIdx >= 0 && row[emailIdx] ? String(row[emailIdx]).trim() : undefined,
                    tags: tagsIdx >= 0 && row[tagsIdx] ? String(row[tagsIdx]).split(',').map((t: string) => t.trim()).filter(Boolean) : [],
                });
            }

            if (imports.length === 0) throw new Error('Tidak ada baris data valid untuk diimport.');

            const res = await fetch('/api/contacts/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contacts: imports }),
            });
            const resData = await res.json();
            if (!resData.success) throw new Error(resData.error);

            setImportResult(resData.data);
            loadContacts();
        } catch (err: any) {
            alert('Import gagal: ' + err.message);
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
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
                    <button className="btn btn-ghost btn-sm" onClick={downloadExcelTemplate} title="Download template Excel (.xlsx)">
                        <Download size={16} /> Template Excel
                    </button>
                    <input ref={fileInputRef} type="file" accept=".xlsx, .xls" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelImport(f); }} />
                    <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                        {importing ? <><Loader2 size={16} className="animate-spin" /> Mengimport...</> : <><Upload size={16} /> Import Excel</>}
                    </button>
                    <a href="/dashboard/contacts/blacklist" className="btn btn-secondary" style={{ color: 'var(--color-danger)' }} title="Kelola nomor terblokir/unsubscribed">
                        <ShieldAlert size={16} /> Blokir Nomor
                    </a>
                    <button className="btn btn-primary" onClick={openAddModal}>
                        <Plus size={16} /> Tambah Kontak
                    </button>
                </div>
            </div>

            {/* Filters and Actions */}
            <div className="flex items-center justify-between flex-wrap gap-4" style={{ marginBottom: 'var(--space-4)' }}>
                <div className="flex gap-3 items-center flex-wrap">
                    <div className="search-wrapper" style={{ width: 300 }}>
                        <Search size={16} className="search-icon" />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Cari nama atau nomor..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    
                    <div className="search-wrapper" style={{ width: 220 }}>
                        <Filter size={16} className="search-icon" />
                        <select 
                            className="form-input" 
                            style={{ paddingLeft: '36px' }}
                            value={selectedCategory} 
                            onChange={e => setSelectedCategory(e.target.value)}
                        >
                            <option value="">Semua Kategori</option>
                            {allCategories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>

                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                        Menampilkan {filtered.length} kontak
                    </span>
                </div>

                {selectedIds.size > 0 && (
                    <button className="btn btn-danger" onClick={handleBulkDelete}>
                        <Trash2 size={16} /> Hapus {selectedIds.size} Terpilih
                    </button>
                )}
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
                            Tambahkan kontak satu per satu atau import dari file Excel.
                        </p>
                        <div className="flex gap-3">
                            <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                                <Upload size={16} /> Import Excel
                            </button>
                            <button className="btn btn-primary" onClick={openAddModal}>
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
                                <th style={{ width: 40, textAlign: 'center' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={isAllSelected}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                <th>Nama</th>
                                <th>Nomor Telepon</th>
                                <th>Email</th>
                                <th>Kategori</th>
                                <th style={{ width: 100 }}>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                                        <p style={{ color: 'var(--color-text-muted)' }}>Tidak ada kontak yang cocok dengan filter.</p>
                                    </td>
                                </tr>
                            ) : filtered.map(contact => (
                                <tr key={contact.id} className={selectedIds.has(contact.id) ? 'selected-row' : ''}>
                                    <td style={{ textAlign: 'center' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={selectedIds.has(contact.id)}
                                            onChange={() => toggleSelectRow(contact.id)}
                                        />
                                    </td>
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
                                        <div className="flex gap-2">
                                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEditModal(contact)} title="Edit Kontak">
                                                <Edit3 size={16} />
                                            </button>
                                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => handleDeleteContact(contact.id)} style={{ color: 'var(--color-danger)' }} title="Hapus">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showContactModal && (
                <div className="modal-backdrop" onClick={() => setShowContactModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
                        <div className="modal-header">
                            <h2 className="modal-title">{editingId ? 'Edit Kontak' : 'Tambah Kontak'}</h2>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowContactModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveContact}>
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
                                    <label className="form-label">Kategori (Pisahkan dengan koma)</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Pelanggan, VIP, Spesial"
                                        value={formData.tags}
                                        onChange={e => setFormData({ ...formData, tags: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="modal-footer" style={{ marginTop: 'var(--space-6)' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowContactModal(false)}>Batal</button>
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
