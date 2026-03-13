'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Trash2, ShieldAlert, Loader2, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function BlacklistPage() {
    const router = useRouter();
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [blacklist, setBlacklist] = useState<any[]>([]);
    const [deleting, setDeleting] = useState<string | null>(null);

    useEffect(() => {
        loadBlacklist();
    }, []);

    const loadBlacklist = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('blacklisted_contacts')
            .select('*')
            .order('created_at', { ascending: false });

        if (data) setBlacklist(data);
        setLoading(false);
    };

    const handleDelete = async (id: string, phone: string) => {
        if (!window.confirm(`Hapus nomor ${phone} dari daftar blokir? Nomor ini akan bisa menerima broadcast lagi.`)) return;

        setDeleting(id);
        const { error } = await supabase.from('blacklisted_contacts').delete().eq('id', id);

        if (!error) {
            setBlacklist(prev => prev.filter(b => b.id !== id));
        } else {
            alert('Gagal menghapus: ' + error.message);
        }
        setDeleting(null);
    };

    return (
        <div>
            <div className="page-header relative">
                <div className="flex items-center gap-3 mb-2">
                    <button onClick={() => router.push('/dashboard/contacts')} className="btn btn-ghost btn-icon">
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h1 className="page-title leading-none">Blokir Nomor (Unsubscribed)</h1>
                    </div>
                </div>
                <p className="page-description ml-10">
                    Nomor-nomor di bawah ini telah menekan tautan berhenti berlangganan atau secara manual ditambahkan. Sistem Broadcast <b>tidak akan pernah</b> mengirim pesan ke nomor-nomor ini.
                </p>
            </div>

            <div className="card">
                {loading ? (
                    <div className="py-8 text-center text-[var(--color-text-muted)]">
                        <Loader2 className="animate-spin mx-auto mb-2" />
                        <p>Memuat daftar nomor terblokir...</p>
                    </div>
                ) : (
                    <div className="table-wrapper">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>No. Telepon</th>
                                    <th>Alasan</th>
                                    <th>Tanggal Pemblokiran</th>
                                    <th style={{ textAlign: 'right' }}>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {blacklist.length > 0 ? (
                                    blacklist.map(b => (
                                        <tr key={b.id}>
                                            <td className="font-semibold text-[var(--color-danger)]">
                                                <div className="flex items-center gap-2">
                                                    <ShieldAlert size={16} />
                                                    {b.phone}
                                                </div>
                                            </td>
                                            <td className="text-[var(--color-text-muted)]">
                                                {b.reason || '-'}
                                            </td>
                                            <td>
                                                {new Date(b.created_at).toLocaleString('id-ID')}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button
                                                    onClick={() => handleDelete(b.id, b.phone)}
                                                    disabled={deleting === b.id}
                                                    className="btn btn-ghost btn-icon text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                                                    title="Hapus dari daftar blokir"
                                                >
                                                    {deleting === b.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={4} className="text-center py-8 text-[var(--color-text-muted)]">
                                            Belum ada nomor yang diblokir.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
