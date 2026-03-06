'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Smartphone, Plus, Wifi, WifiOff, QrCode, Trash2, MoreVertical } from 'lucide-react';
import type { Device } from '@/types';

export default function DevicesPage() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        loadDevices();
    }, []);

    const loadDevices = async () => {
        try {
            const { data } = await supabase
                .from('devices')
                .select('*')
                .order('created_at', { ascending: false });
            setDevices(data || []);
        } catch (err) {
            console.error('Error loading devices:', err);
        } finally {
            setLoading(false);
        }
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
        <div>
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
                        <div key={device.id} className="card card-hover">
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
                                <button className="btn btn-ghost btn-icon btn-sm">
                                    <MoreVertical size={16} />
                                </button>
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
