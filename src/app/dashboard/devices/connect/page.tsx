'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    Smartphone, ArrowLeft, QrCode, CheckCircle,
    RefreshCw, AlertCircle, Loader2, Wifi, Zap, Info
} from 'lucide-react';

type Provider = 'waha' | 'official' | 'wa-web';
type Step = 'provider' | 'config' | 'connecting' | 'done';

export default function DeviceConnectPage() {
    const [step, setStep] = useState<Step>('provider');
    const [provider, setProvider] = useState<Provider>('wa-web');
    const [deviceName, setDeviceName] = useState('');
    const [wahaApiUrl, setWahaApiUrl] = useState('http://localhost:3000');
    const [wahaApiKey, setWahaApiKey] = useState('');
    const [bridgeUrl, setBridgeUrl] = useState(process.env.NEXT_PUBLIC_BRIDGE_URL || '');
    const [bridgeApiSecret, setBridgeApiSecret] = useState('');
    const [officialAccessToken, setOfficialAccessToken] = useState('');
    const [officialPhoneId, setOfficialPhoneId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [deviceId, setDeviceId] = useState('');
    const [qrCode, setQrCode] = useState('');
    const [status, setStatus] = useState('qr_pending');
    const qrInterval = useRef<NodeJS.Timeout | null>(null);
    const router = useRouter();

    // Poll QR code every 5s for WAHA and WA Web (bridge)
    useEffect(() => {
        if (step === 'connecting' && (provider === 'waha' || provider === 'wa-web') && deviceId) {
            fetchQR();
            qrInterval.current = setInterval(() => {
                fetchQR();
                checkStatus();
            }, 5000);
        }
        return () => {
            if (qrInterval.current) clearInterval(qrInterval.current);
        };
    }, [step, deviceId]);

    const fetchQR = async () => {
        if (!deviceId) return;
        try {
            const res = await fetch(`/api/devices/${deviceId}/qr`);
            const data = await res.json();
            if (data.data?.qr) setQrCode(data.data.qr);
        } catch { /* ignore */ }
    };

    const checkStatus = async () => {
        if (!deviceId) return;
        try {
            const res = await fetch(`/api/devices/${deviceId}`);
            const data = await res.json();
            if (data.data?.status === 'connected') {
                if (qrInterval.current) clearInterval(qrInterval.current);
                setStatus('connected');
                setStep('done');
            }
        } catch { /* ignore */ }
    };

    const handleCreateDevice = async () => {
        if (!deviceName.trim()) {
            setError('Nama device wajib diisi');
            return;
        }
        setLoading(true);
        setError('');

        const providerConfig = provider === 'waha'
            ? { apiUrl: wahaApiUrl, apiKey: wahaApiKey }
            : provider === 'wa-web'
                ? { apiUrl: bridgeUrl, apiKey: bridgeApiSecret }
                : { accessToken: officialAccessToken, phoneNumberId: officialPhoneId };

        try {
            const res = await fetch('/api/devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: deviceName, provider, provider_config: providerConfig }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setDeviceId(data.data.id);
            setStep('connecting');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div className="page-header">
                <div className="flex items-center gap-3">
                    <a href="/dashboard/devices" className="btn btn-ghost btn-icon">
                        <ArrowLeft size={18} />
                    </a>
                    <div>
                        <h1 className="page-title">Hubungkan Device</h1>
                        <p className="page-description">Tambahkan nomor WhatsApp baru</p>
                    </div>
                </div>
            </div>

            {/* Progress Steps */}
            <div className="steps-bar">
                {['provider', 'config', 'connecting', 'done'].map((s, i) => (
                    <div key={s} className={`step-item ${step === s ? 'active' : ''} ${['provider', 'config', 'connecting', 'done'].indexOf(step) > i ? 'done' : ''}`}>
                        <div className="step-dot">{['provider', 'config', 'connecting', 'done'].indexOf(step) > i ? <CheckCircle size={14} /> : i + 1}</div>
                        <span className="step-label">
                            {s === 'provider' ? 'Provider' : s === 'config' ? 'Konfigurasi' : s === 'connecting' ? 'Hubungkan' : 'Selesai'}
                        </span>
                    </div>
                ))}
            </div>

            <div className="connect-card card" style={{ maxWidth: 640, margin: '0 auto' }}>
                {/* STEP 1: Provider selection */}
                {step === 'provider' && (
                    <div className="step-content">
                        <h3 className="step-title">Pilih WA Provider</h3>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>
                            Pilih provider sesuai kebutuhan Anda. Bisa diganti kapan saja.
                        </p>
                        <div className="provider-cards">
                            {/* WA Web — recommended, shown first */}
                            <div
                                className={`provider-card ${provider === 'wa-web' ? 'selected' : ''}`}
                                onClick={() => setProvider('wa-web')}
                            >
                                <div className="provider-icon" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                                    <QrCode size={24} />
                                </div>
                                <div className="provider-info">
                                    <h4>WA Web (Bridge) ⭐ Recommended</h4>
                                    <p>Scan QR seperti starsender.id. Langsung konek tanpa server tambahan.</p>
                                    <div className="flex gap-1" style={{ marginTop: 'var(--space-2)' }}>
                                        <span className="badge badge-success">Scan QR</span>
                                        <span className="badge badge-success">Gratis</span>
                                        <span className="badge badge-accent">Termudah</span>
                                    </div>
                                </div>
                                <div className={`provider-radio ${provider === 'wa-web' ? 'checked' : ''}`} />
                            </div>

                            <div
                                className={`provider-card ${provider === 'waha' ? 'selected' : ''}`}
                                onClick={() => setProvider('waha')}
                            >
                                <div className="provider-icon" style={{ background: 'var(--color-whatsapp-soft)', color: 'var(--color-whatsapp)' }}>
                                    <Wifi size={24} />
                                </div>
                                <div className="provider-info">
                                    <h4>WAHA (Self-hosted)</h4>
                                    <p>Scan QR Code. Self-hosted Docker, cocok jika punya server sendiri.</p>
                                    <div className="flex gap-1" style={{ marginTop: 'var(--space-2)' }}>
                                        <span className="badge badge-success">Gratis</span>
                                        <span className="badge badge-warning">Butuh Docker</span>
                                    </div>
                                </div>
                                <div className={`provider-radio ${provider === 'waha' ? 'checked' : ''}`} />
                            </div>

                            <div
                                className={`provider-card ${provider === 'official' ? 'selected' : ''}`}
                                onClick={() => setProvider('official')}
                            >
                                <div className="provider-icon" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
                                    <Zap size={24} />
                                </div>
                                <div className="provider-info">
                                    <h4>Official API (Meta)</h4>
                                    <p>WhatsApp Business API resmi dari Meta. Lebih stabil, cocok untuk production.</p>
                                    <div className="flex gap-1" style={{ marginTop: 'var(--space-2)' }}>
                                        <span className="badge badge-accent">Official</span>
                                        <span className="badge badge-info">Berbayar</span>
                                    </div>
                                </div>
                                <div className={`provider-radio ${provider === 'official' ? 'checked' : ''}`} />
                            </div>
                        </div>
                        <div style={{ marginTop: 'var(--space-6)', textAlign: 'right' }}>
                            <button className="btn btn-primary" onClick={() => setStep('config')}>
                                Lanjut →
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 2: Config */}
                {step === 'config' && (
                    <div className="step-content">
                        <h3 className="step-title">Konfigurasi Device</h3>
                        {error && <div className="auth-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                            <div className="form-group">
                                <label className="form-label">Nama Device *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="contoh: Sales WA, CS WA, Marketing"
                                    value={deviceName}
                                    onChange={e => setDeviceName(e.target.value)}
                                />
                            </div>

                            {provider === 'wa-web' && (
                                <>
                                    <div className="info-box" style={{ borderColor: 'rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)' }}>
                                        <Info size={16} style={{ flexShrink: 0, color: '#22c55e' }} />
                                        <span>Bridge URL sudah diisi otomatis. Cukup masukkan API Secret yang sama dengan yang Anda set di Railway bridge service.</span>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Bridge URL *</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="https://your-bridge.up.railway.app"
                                            value={bridgeUrl}
                                            onChange={e => setBridgeUrl(e.target.value)}
                                        />
                                        <span className="form-hint">URL service bridge Baileys di Railway</span>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">API Secret *</label>
                                        <input
                                            type="password"
                                            className="form-input"
                                            placeholder="gasbroadcast_bridge_2026"
                                            value={bridgeApiSecret}
                                            onChange={e => setBridgeApiSecret(e.target.value)}
                                        />
                                        <span className="form-hint">Sama dengan API_SECRET di environment bridge</span>
                                    </div>
                                </>
                            )}

                            {provider === 'waha' && (
                                <>
                                    <div className="info-box">
                                        <Info size={16} style={{ flexShrink: 0, color: 'var(--color-info)' }} />
                                        <span>WAHA harus berjalan di server/Docker. Jika belum, jalankan: <code>docker run -it -p 3000:3000 devlikeapro/waha</code></span>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">WAHA API URL</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="http://localhost:3000"
                                            value={wahaApiUrl}
                                            onChange={e => setWahaApiUrl(e.target.value)}
                                        />
                                        <span className="form-hint">URL server WAHA. Default: http://localhost:3000</span>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">WAHA API Key (opsional)</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="Kosongkan jika tidak ada"
                                            value={wahaApiKey}
                                            onChange={e => setWahaApiKey(e.target.value)}
                                        />
                                    </div>
                                </>
                            )}

                            {provider === 'official' && (
                                <>
                                    <div className="info-box">
                                        <Info size={16} style={{ flexShrink: 0, color: 'var(--color-info)' }} />
                                        <span>Butuh Meta Business Account dan WhatsApp Business API access. <a href="https://developers.facebook.com/docs/whatsapp" target="_blank">Pelajari cara setup →</a></span>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Access Token *</label>
                                        <input
                                            type="password"
                                            className="form-input"
                                            placeholder="EAAxxxxxxx..."
                                            value={officialAccessToken}
                                            onChange={e => setOfficialAccessToken(e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Phone Number ID *</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="123456789012345"
                                            value={officialPhoneId}
                                            onChange={e => setOfficialPhoneId(e.target.value)}
                                        />
                                        <span className="form-hint">Temukan di Meta Business Manager → WhatsApp → Phone Numbers</span>
                                    </div>
                                </>
                            )}
                        </div>
                        <div style={{ marginTop: 'var(--space-6)', display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => setStep('provider')}>← Kembali</button>
                            <button className="btn btn-primary" onClick={handleCreateDevice} disabled={loading}>
                                {loading ? <><Loader2 size={16} className="animate-spin" /> Memproses...</> : 'Hubungkan →'}
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 3: QR / Connecting */}
                {step === 'connecting' && (
                    <div className="step-content" style={{ textAlign: 'center' }}>
                        {(provider === 'waha' || provider === 'wa-web') ? (
                            <>
                                <h3 className="step-title">Scan QR Code</h3>
                                <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)' }}>
                                    Buka WhatsApp → Perangkat Tertaut → Tautkan perangkat → Scan QR
                                </p>
                                <div className="qr-wrapper">
                                    {qrCode ? (
                                        <img
                                            src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                                            alt="QR Code"
                                            className="qr-image"
                                        />
                                    ) : (
                                        <div className="qr-loading">
                                            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
                                            <p style={{ marginTop: 'var(--space-3)', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                                                {provider === 'wa-web' ? 'Memulai sesi WA Web...' : 'Mengambil QR Code...'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-4)' }}>
                                    QR otomatis diperbarui setiap 5 detik
                                </p>
                                <button className="btn btn-secondary btn-sm" style={{ marginTop: 'var(--space-3)' }} onClick={fetchQR}>
                                    <RefreshCw size={14} /> Refresh QR
                                </button>
                            </>
                        ) : (
                            <>
                                <h3 className="step-title">Menghubungkan...</h3>
                                <Loader2 size={40} className="animate-spin" style={{ color: 'var(--color-accent)', margin: 'var(--space-8) auto' }} />
                                <p style={{ color: 'var(--color-text-muted)' }}>Memverifikasi credentials Official API...</p>
                                <button className="btn btn-primary" style={{ marginTop: 'var(--space-6)' }} onClick={() => { setStep('done'); }}>
                                    Konfirmasi Terhubung
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* STEP 4: Done */}
                {step === 'done' && (
                    <div className="step-content" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--color-success-soft)', color: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto var(--space-4)' }}>
                            <CheckCircle size={36} />
                        </div>
                        <h3 className="step-title">Device Terhubung! 🎉</h3>
                        <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)' }}>
                            WhatsApp Anda berhasil terhubung. Siap kirim broadcast!
                        </p>
                        <div className="flex gap-3" style={{ justifyContent: 'center' }}>
                            <a href="/dashboard/devices" className="btn btn-secondary">Lihat Semua Device</a>
                            <a href="/dashboard/broadcast/create" className="btn btn-primary">Buat Broadcast →</a>
                        </div>
                    </div>
                )}
            </div>

            <style jsx>{`
        /* Steps progress */
        .steps-bar {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0;
          margin-bottom: var(--space-8);
        }
        .step-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          color: var(--color-text-muted);
          font-size: var(--text-sm);
        }
        .step-item:not(:last-child)::after {
          content: '';
          width: 48px;
          height: 1px;
          background: var(--color-border);
          display: block;
          margin: 0 var(--space-3);
        }
        .step-item.active {
          color: var(--color-accent);
        }
        .step-item.done {
          color: var(--color-success);
        }
        .step-dot {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          border: 2px solid currentColor;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: var(--text-xs);
          font-weight: 700;
          flex-shrink: 0;
        }
        .step-label {
          white-space: nowrap;
        }

        /* Provider cards */
        .provider-cards {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .provider-card {
          display: flex;
          align-items: flex-start;
          gap: var(--space-4);
          padding: var(--space-4);
          border: 2px solid var(--color-border);
          border-radius: var(--radius-lg);
          cursor: pointer;
          transition: all var(--transition-base);
        }
        .provider-card:hover {
          border-color: var(--color-border-hover);
          background: var(--color-bg-hover);
        }
        .provider-card.selected {
          border-color: var(--color-accent);
          background: var(--color-accent-soft);
        }
        .provider-icon {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-lg);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .provider-info {
          flex: 1;
        }
        .provider-info h4 {
          font-size: var(--text-md);
          margin-bottom: var(--space-1);
        }
        .provider-info p {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
        }
        .provider-radio {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 2px solid var(--color-border);
          flex-shrink: 0;
          margin-top: 4px;
          transition: all var(--transition-fast);
        }
        .provider-radio.checked {
          border-color: var(--color-accent);
          background: var(--color-accent);
          box-shadow: inset 0 0 0 4px var(--color-bg-secondary);
        }

        /* Step content */
        .step-title {
          font-size: var(--text-xl);
          font-weight: var(--font-weight-semibold);
          margin-bottom: var(--space-2);
        }

        /* Info box */
        .info-box {
          display: flex;
          align-items: flex-start;
          gap: var(--space-3);
          padding: var(--space-3);
          background: var(--color-info-soft);
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
        }
        .info-box code {
          background: var(--color-bg-tertiary);
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          font-family: var(--font-mono);
          font-size: var(--text-xs);
        }

        /* QR */
        .qr-wrapper {
          width: 220px;
          height: 220px;
          margin: 0 auto;
          border: 2px solid var(--color-border);
          border-radius: var(--radius-lg);
          display: flex;
          align-items: center;
          justify-content: center;
          background: white;
          padding: var(--space-3);
        }
        .qr-image {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .qr-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        /* Auth error (reused) */
        .auth-error {
          padding: var(--space-3) var(--space-4);
          background: var(--color-danger-soft);
          border: 1px solid var(--color-danger);
          border-radius: var(--radius-md);
          color: var(--color-danger);
          font-size: var(--text-sm);
        }
      `}</style>
        </div>
    );
}
