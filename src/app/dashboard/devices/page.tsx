'use client';

import { useState, useEffect, useRef } from 'react';
import { Smartphone, Plus, MoreVertical, Trash2, QrCode, RefreshCw } from 'lucide-react';
import type { Device } from '@/types';

export default function DevicesPage() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadDevices();
        // Close dropdown on outside click
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpenMenu(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const loadDevices = async () => {
        try {
            const res = await fetch('/api/devices');
            const data = await res.json();
            setDevices(data.data || []);
        } catch (err) {
            console.error('Error loading devices:', err);
        } finally {
            setLoading(false);
        }
    };

    const deleteDevice = async (deviceId: string) => {
        if (!confirm('Hapus device ini?')) return;
        try {
            await fetch(`/api/devices/${deviceId}`, { method: 'DELETE' });
            setDevices(prev => prev.filter(d => d.id !== deviceId));
        } catch (err) {
            console.error('Delete failed:', err);
        }
        setOpenMenu(null);
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'connected':
                return <span className="badge badge-success"><span className="status-dot status-dot-connected" /> Connected</span>;
            case 'qr_pending':
                return <span className="badge badge-warning"><span className="status-dot status-dot-pending" /> QR Pending</span>;
            default:
                return <span className="badge badge-default"><span className="status-dot status-dot-disconnected" /> Disconnected</span>;
        }
    };

    return (
        <div ref={menuRef}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Devices</h1>
                    <p className="page-description">Kelola perangkat WhatsApp yang terhubung</p>
                </div>
                <div className="page-actions">
                    <a href="/dashboard/devices/connect" className="btn btn-primary">
                        <Plus size={16} /> Hubungkan Device
                    </a>
                </div>
            </div>

            {loading ? (
                <div className="grid grid-cols-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="card">
                            <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-md)' }} />
                        </div>
                    ))}
                </div>
            ) : devices.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <Smartphone size={48} className="empty-state-icon" />
                        <h3 className="empty-state-title">Belum Ada Device</h3>
                        <p className="empty-state-description">
                            Hubungkan nomor WhatsApp Anda untuk mulai mengirim broadcast dan menerima pesan.
                        </p>
                        <a href="/dashboard/devices/connect" className="btn btn-primary">
                            <Plus size={16} /> Hubungkan Device Pertama
                        </a>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-3">
                    {devices.map(device => (
                        <div key={device.id} className="card card-hover" style={{ position: 'relative' }}>
                            <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-4)' }}>
                                <div className="flex items-center gap-3">
                                    <div className="avatar" style={{
                                        background: device.status === 'connected' ? 'var(--color-whatsapp-soft)' : 'var(--color-bg-hover)',
                                        color: device.status === 'connected' ? 'var(--color-whatsapp)' : 'var(--color-text-muted)',
                                    }}>
                                        <Smartphone size={18} />
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{device.name}</div>
                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                                            {device.phone_number || 'No phone'}
                                        </div>
                                    </div>
                                </div>

                                {/* 3-dot menu */}
                                <div style={{ position: 'relative' }}>
                                    <button
                                        className="btn btn-ghost btn-icon btn-sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenMenu(openMenu === device.id ? null : device.id);
                                        }}
                                    >
                                        <MoreVertical size={16} />
                                    </button>

                                    {openMenu === device.id && (
                                        <div style={{
                                            position: 'absolute',
                                            right: 0,
                                            top: '100%',
                                            marginTop: 4,
                                            background: 'var(--color-bg-secondary)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-md)',
                                            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                                            zIndex: 100,
                                            minWidth: 160,
                                            overflow: 'hidden',
                                        }}>
                                            {(device.status === 'qr_pending' || device.status === 'disconnected') && (
                                                <a
                                                    href="/dashboard/devices/connect"
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                        padding: '10px 14px', fontSize: 'var(--text-sm)',
                                                        color: 'var(--color-text-primary)', cursor: 'pointer',
                                                        textDecoration: 'none',
                                                    }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                >
                                                    <QrCode size={14} /> Hubungkan Ulang
                                                </a>
                                            )}
                                            <button
                                                onClick={() => deleteDevice(device.id)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                    padding: '10px 14px', fontSize: 'var(--text-sm)',
                                                    color: 'var(--color-danger)', cursor: 'pointer',
                                                    background: 'none', border: 'none', width: '100%', textAlign: 'left',
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-danger-soft)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                <Trash2 size={14} /> Hapus Device
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                {getStatusBadge(device.status)}
                                <span className="badge badge-default" style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                                    {device.provider}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
