'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Smartphone, Plus, MoreVertical, Trash2, QrCode, RefreshCw, AlertTriangle, Users, ShieldAlert } from 'lucide-react';
import type { Device } from '@/types';

interface DeviceHealth {
    deviceId: string;
    name: string;
    dbStatus: string;
    bridgeStatus: string;
    realStatus?: string;
    isHealthy: boolean | null;
    decryptErrorCount: number;
    deviceContacts: number;
    error?: string;
}

export default function DevicesPage() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const [healthData, setHealthData] = useState<Record<string, DeviceHealth>>({});
    const [checkingHealth, setCheckingHealth] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadDevices();
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

    const checkHealth = useCallback(async () => {
        setCheckingHealth(true);
        try {
            const res = await fetch('/api/devices/health');
            const data = await res.json();
            if (data.success && data.data) {
                const map: Record<string, DeviceHealth> = {};
                for (const h of data.data) {
                    map[h.deviceId] = h;
                }
                setHealthData(map);

                // Update local device status if changed
                setDevices(prev => prev.map(d => {
                    const h = map[d.id];
                    if (h?.realStatus && h.realStatus !== d.status) {
                        return { ...d, status: h.realStatus as Device['status'] };
                    }
                    return d;
                }));
            }
        } catch (err) {
            console.error('Health check failed:', err);
        } finally {
            setCheckingHealth(false);
        }
    }, []);

    // Auto health check every 30 seconds
    useEffect(() => {
        if (devices.length === 0) return;
        checkHealth();
        const interval = setInterval(checkHealth, 30_000);
        return () => clearInterval(interval);
    }, [devices.length, checkHealth]);

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
            case 'unhealthy':
                return (
                    <span className="badge" style={{
                        background: 'rgba(239, 68, 68, 0.15)',
                        color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                    }}>
                        <AlertTriangle size={12} style={{ marginRight: 4 }} /> Sesi Rusak
                    </span>
                );
            default:
                return <span className="badge badge-default"><span className="status-dot status-dot-disconnected" /> Disconnected</span>;
        }
    };

    const getHealthInfo = (deviceId: string) => {
        const h = healthData[deviceId];
        if (!h) return null;
        return h;
    };

    return (
        <div ref={menuRef}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Devices</h1>
                    <p className="page-description">Kelola perangkat WhatsApp yang terhubung</p>
                </div>
                <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
                    <button
                        className="btn btn-ghost"
                        onClick={checkHealth}
                        disabled={checkingHealth}
                        title="Cek Status Real-Time"
                    >
                        <RefreshCw size={16} className={checkingHealth ? 'spinning' : ''} />
                        {checkingHealth ? 'Checking...' : 'Cek Status'}
                    </button>
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
                    {devices.map(device => {
                        const health = getHealthInfo(device.id);
                        const isUnhealthy = device.status === 'unhealthy' || (health && !health.isHealthy);
                        const hasNoContacts = health && health.deviceContacts === 0 && device.status === 'connected';

                        return (
                            <div key={device.id} className="card card-hover" style={{
                                position: 'relative',
                                borderColor: isUnhealthy ? 'rgba(239, 68, 68, 0.4)' : undefined,
                            }}>
                                <div className="flex items-center justify-between" style={{ marginBottom: 'var(--space-4)' }}>
                                    <div className="flex items-center gap-3">
                                        <div className="avatar" style={{
                                            background: isUnhealthy ? 'rgba(239, 68, 68, 0.15)'
                                                : device.status === 'connected' ? 'var(--color-whatsapp-soft)' : 'var(--color-bg-hover)',
                                            color: isUnhealthy ? '#ef4444'
                                                : device.status === 'connected' ? 'var(--color-whatsapp)' : 'var(--color-text-muted)',
                                        }}>
                                            {isUnhealthy ? <ShieldAlert size={18} /> : <Smartphone size={18} />}
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
                                                {(device.status !== 'connected') && (
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
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        {health && device.status === 'connected' && (
                                            <span className="badge badge-default" style={{ fontSize: '10px', gap: 4 }}>
                                                <Users size={10} /> {health.deviceContacts} kontak
                                            </span>
                                        )}
                                        <span className="badge badge-default" style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                                            {device.provider}
                                        </span>
                                    </div>
                                </div>

                                {/* Warning banner for unhealthy sessions */}
                                {isUnhealthy && (
                                    <div style={{
                                        marginTop: 'var(--space-3)',
                                        padding: '8px 12px',
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        border: '1px solid rgba(239, 68, 68, 0.25)',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: 'var(--text-xs)',
                                        color: '#ef4444',
                                        lineHeight: 1.5,
                                    }}>
                                        <strong>⚠️ Sesi Enkripsi Rusak</strong>
                                        <br />
                                        {health ? `${health.decryptErrorCount} decrypt errors` : 'Signal Protocol corrupted'}.
                                        Hapus device lalu scan ulang QR code.
                                    </div>
                                )}

                                {/* Warning banner for 0 contacts */}
                                {hasNoContacts && !isUnhealthy && (
                                    <div style={{
                                        marginTop: 'var(--space-3)',
                                        padding: '8px 12px',
                                        background: 'rgba(245, 158, 11, 0.1)',
                                        border: '1px solid rgba(245, 158, 11, 0.25)',
                                        borderRadius: 'var(--radius-sm)',
                                        fontSize: 'var(--text-xs)',
                                        color: '#f59e0b',
                                        lineHeight: 1.5,
                                    }}>
                                        <strong>⚠️ 0 Kontak Device</strong>
                                        <br />
                                        Status WA tidak akan terlihat siapapun.
                                        Coba hapus dan scan ulang QR.
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <style jsx>{`
                .spinning {
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
