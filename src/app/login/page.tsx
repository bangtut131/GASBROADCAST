'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        {/* Left side — Branding */}
        <div className="auth-branding">
          <div className="auth-branding-content">
            <div className="auth-logo">
              <div className="auth-logo-icon" style={{ background: 'transparent' }}>
                <img src="/logo.png" alt="GAS Broadcast Logo" style={{ height: '110px', width: 'auto', maxWidth: '100%', objectFit: 'contain' }} />
              </div>
              <span className="auth-logo-text">GAS Smart Broadcast</span>
            </div>
            <h1 className="auth-branding-title">
              Platform WhatsApp Marketing
              <span className="text-accent"> Terlengkap</span>
            </h1>
            <p className="auth-branding-desc">
              Kirim pesan broadcast, auto-reply cerdas dengan AI, dan kelola ribuan
              kontak dalam satu dashboard yang powerful.
            </p>
            <div className="auth-features">
              <div className="auth-feature">
                <span className="auth-feature-icon">📡</span>
                <span>Broadcast ke ribuan kontak</span>
              </div>
              <div className="auth-feature">
                <span className="auth-feature-icon">🤖</span>
                <span>Auto-Reply dengan AI</span>
              </div>
              <div className="auth-feature">
                <span className="auth-feature-icon">📊</span>
                <span>Delivery Report real-time</span>
              </div>
              <div className="auth-feature">
                <span className="auth-feature-icon">🔌</span>
                <span>REST API untuk integrasi</span>
              </div>
            </div>
          </div>
          <div className="auth-branding-glow" />
        </div>

        {/* Right side — Form */}
        <div className="auth-form-wrapper">
          <div className="auth-form-card card-glass">
            <div className="auth-form-header">
              <h2>Selamat Datang!</h2>
              <p className="text-muted">Masuk ke akun Anda untuk melanjutkan</p>
            </div>

            {error && (
              <div className="auth-error">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="auth-form">
              <div className="form-group">
                <label className="form-label" htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  className="form-input"
                  placeholder="nama@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="password">Password</label>
                <div className="password-wrapper">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Masukkan password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg auth-submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Memproses...
                  </>
                ) : (
                  'Masuk'
                )}
              </button>
            </form>

            <div className="auth-form-footer">
              <p className="text-muted">
                Belum punya akun?{' '}
                <Link href="/register" className="auth-link">
                  Daftar sekarang
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-bg-primary);
          padding: var(--space-4);
        }
        .auth-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          max-width: 1000px;
          width: 100%;
          gap: var(--space-8);
          align-items: center;
        }
        @media (max-width: 768px) {
          .auth-container {
            grid-template-columns: 1fr;
          }
          .auth-branding {
            display: none;
          }
        }

        /* Branding */
        .auth-branding {
          position: relative;
          padding: var(--space-8);
        }
        .auth-branding-content {
          position: relative;
          z-index: 2;
        }
        .auth-branding-glow {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, var(--color-accent-glow), transparent 70%);
          border-radius: 50%;
          pointer-events: none;
          z-index: 1;
        }
        .auth-logo {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          margin-bottom: var(--space-8);
        }
        .auth-logo-icon {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-lg);
          background: linear-gradient(135deg, var(--color-accent), var(--color-whatsapp));
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }
        .auth-logo-text {
          font-size: var(--text-xl);
          font-weight: var(--font-weight-bold);
          color: var(--color-text-primary);
        }
        .auth-branding-title {
          font-size: var(--text-3xl);
          font-weight: var(--font-weight-bold);
          line-height: 1.2;
          margin-bottom: var(--space-4);
        }
        .auth-branding-desc {
          font-size: var(--text-base);
          color: var(--color-text-muted);
          margin-bottom: var(--space-8);
          line-height: var(--line-height-relaxed);
        }
        .auth-features {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .auth-feature {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
        }
        .auth-feature-icon {
          font-size: 1.25rem;
        }

        /* Form */
        .auth-form-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .auth-form-card {
          width: 100%;
          max-width: 420px;
          padding: var(--space-8);
          border-radius: var(--radius-xl);
        }
        .auth-form-header {
          margin-bottom: var(--space-6);
        }
        .auth-form-header h2 {
          font-size: var(--text-2xl);
          margin-bottom: var(--space-2);
        }
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .password-wrapper {
          position: relative;
        }
        .password-toggle {
          position: absolute;
          right: var(--space-3);
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--color-text-muted);
          cursor: pointer;
          padding: var(--space-1);
        }
        .password-toggle:hover {
          color: var(--color-text-primary);
        }
        .auth-submit {
          width: 100%;
          margin-top: var(--space-2);
        }
        .auth-error {
          padding: var(--space-3) var(--space-4);
          background: var(--color-danger-soft);
          border: 1px solid var(--color-danger);
          border-radius: var(--radius-md);
          color: var(--color-danger);
          font-size: var(--text-sm);
          margin-bottom: var(--space-2);
        }
        .auth-form-footer {
          text-align: center;
          margin-top: var(--space-6);
          font-size: var(--text-sm);
        }
        .auth-link {
          color: var(--color-accent);
          font-weight: var(--font-weight-medium);
        }
        .auth-link:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
