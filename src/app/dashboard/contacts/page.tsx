'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Users, Plus, Search, Upload, Tag, Trash2, MoreVertical } from 'lucide-react';
import type { Contact } from '@/types';

export default function ContactsPage() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
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

    const filtered = contacts.filter(c =>
        (c.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery)
    );

    return (
        <div>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Contacts</h1>
                    <p className="page-description">Kelola daftar kontak untuk broadcast</p>
                </div>
                <div className="page-actions">
                    <button className="btn btn-secondary">
                        <Upload size={16} /> Import CSV
                    </button>
                    <button className="btn btn-primary">
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
                            <button className="btn btn-secondary">
                                <Upload size={16} /> Import CSV
                            </button>
                            <button className="btn btn-primary">
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
        </div>
    );
}
