import Link from 'next/link';
import Image from 'next/image';
import { MessageSquare, Send, Bot, Users, Smartphone, BarChart3, Zap, Shield, Code, ArrowRight, Check } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="landing">
      {/* Navigation */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-nav-brand">
            <div className="landing-logo-icon" style={{ background: 'transparent', width: 56, height: 56 }}>
              <Image src="/logo.png" alt="GAS Broadcast Logo" width={56} height={56} style={{ objectFit: 'contain' }} priority unoptimized />
            </div>
            <span className="landing-logo-text">GAS Smart Broadcast</span>
          </div>
          <div className="landing-nav-actions">
            <Link href="/login" className="btn btn-ghost">Masuk</Link>
            <Link href="/register" className="btn btn-primary">Daftar Gratis</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-content">
          <span className="hero-badge badge badge-accent">
            <Zap size={12} /> Platform #1 WhatsApp Marketing
          </span>
          <h1 className="hero-title">
            Kirim Broadcast WhatsApp
            <br />
            <span className="hero-gradient">Tanpa Batas</span>
          </h1>
          <p className="hero-desc">
            Platform all-in-one untuk broadcast pesan, auto-reply dengan AI,
            dan kelola ribuan kontak. Tingkatkan engagement bisnis Anda hingga 98%.
          </p>
          <div className="hero-actions">
            <Link href="/register" className="btn btn-primary btn-lg">
              Mulai Gratis <ArrowRight size={18} />
            </Link>
            <Link href="#features" className="btn btn-secondary btn-lg">
              Lihat Fitur
            </Link>
          </div>
          <div className="hero-trust">
            <Check size={14} style={{ color: 'var(--color-success)' }} />
            <span>Gratis untuk memulai</span>
            <span className="hero-trust-dot">•</span>
            <Check size={14} style={{ color: 'var(--color-success)' }} />
            <span>Tidak perlu kartu kredit</span>
            <span className="hero-trust-dot">•</span>
            <Check size={14} style={{ color: 'var(--color-success)' }} />
            <span>Setup 5 menit</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features" id="features">
        <div className="features-inner">
          <div className="section-header">
            <span className="badge badge-accent">Fitur Lengkap</span>
            <h2 className="section-title">Semua yang Anda Butuhkan</h2>
            <p className="section-desc">
              Dari broadcast massal hingga auto-reply cerdas, semua tersedia dalam satu platform.
            </p>
          </div>
          <div className="features-grid">
            {[
              { icon: <Send size={24} />, title: 'GAS Smart Broadcast', desc: 'Kirim pesan ke ribuan kontak sekaligus dengan personalisasi nama & variabel.' },
              { icon: <Bot size={24} />, title: 'Smart Auto Reply', desc: 'Balas pesan otomatis dengan keyword atau AI. Lebih cerdas & natural.' },
              { icon: <Users size={24} />, title: 'Contact Management', desc: 'Import CSV, validasi nomor, hapus duplikat, dan kelola grup kontak.' },
              { icon: <Smartphone size={24} />, title: 'Multi Device', desc: 'Hubungkan beberapa nomor WhatsApp sekaligus dalam satu dashboard.' },
              { icon: <BarChart3 size={24} />, title: 'Delivery Report', desc: 'Pantau pesan terkirim, gagal, dan dibaca secara real-time.' },
              { icon: <Code size={24} />, title: 'REST API', desc: 'Integrasikan dengan aplikasi Anda via REST API yang terdokumentasi.' },
              { icon: <Shield size={24} />, title: 'Multi Provider', desc: 'Support WAHA (unofficial) & WhatsApp Business API (official).' },
              { icon: <MessageSquare size={24} />, title: 'Chat Inbox', desc: 'Kelola semua percakapan dalam satu inbox real-time.' },
            ].map((feature, i) => (
              <div key={i} className="feature-card card card-hover">
                <div className="feature-icon">{feature.icon}</div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-desc">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="pricing" id="pricing">
        <div className="pricing-inner">
          <div className="section-header">
            <span className="badge badge-accent">Harga</span>
            <h2 className="section-title">Pilih Plan yang Sesuai</h2>
            <p className="section-desc">Mulai gratis, upgrade kapan saja.</p>
          </div>
          <div className="pricing-grid">
            {[
              {
                name: 'Free',
                price: 'Rp 0',
                period: '/bulan',
                desc: 'Untuk memulai dan mencoba',
                features: ['1 Device', '100 Kontak', '100 Pesan/hari', 'Basic Auto Reply'],
                cta: 'Mulai Gratis',
                popular: false,
              },
              {
                name: 'Pro',
                price: 'Rp 199K',
                period: '/bulan',
                desc: 'Untuk bisnis yang berkembang',
                features: ['5 Device', 'Unlimited Kontak', 'Unlimited Pesan', 'AI Auto Reply', 'REST API', 'Delivery Report', 'Priority Support'],
                cta: 'Pilih Pro',
                popular: true,
              },
              {
                name: 'Enterprise',
                price: 'Custom',
                period: '',
                desc: 'Untuk kebutuhan khusus',
                features: ['Unlimited Device', 'Unlimited Kontak', 'Unlimited Pesan', 'AI Auto Reply', 'Full REST API', 'Webhook', 'Multi Agent CS', 'Dedicated Support'],
                cta: 'Hubungi Kami',
                popular: false,
              },
            ].map((plan, i) => (
              <div key={i} className={`pricing-card card ${plan.popular ? 'card-accent' : ''}`}>
                {plan.popular && <span className="pricing-popular badge badge-accent">Most Popular</span>}
                <h3 className="pricing-name">{plan.name}</h3>
                <p className="pricing-desc">{plan.desc}</p>
                <div className="pricing-price">
                  <span className="pricing-amount">{plan.price}</span>
                  <span className="pricing-period">{plan.period}</span>
                </div>
                <ul className="pricing-features">
                  {plan.features.map((f, j) => (
                    <li key={j}>
                      <Check size={14} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={`btn ${plan.popular ? 'btn-primary' : 'btn-secondary'} btn-lg`}
                  style={{ width: '100%' }}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="cta-inner">
          <h2 className="cta-title">Siap Meningkatkan Bisnis Anda?</h2>
          <p className="cta-desc">Daftar sekarang dan mulai kirim broadcast dalam 5 menit.</p>
          <Link href="/register" className="btn btn-primary btn-lg">
            Daftar Gratis Sekarang <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <div className="landing-logo-icon" style={{ width: 44, height: 44, background: 'transparent' }}>
              <Image src="/logo.png" alt="GAS Broadcast Logo" width={44} height={44} style={{ objectFit: 'contain' }} unoptimized />
            </div>
            <span className="landing-logo-text">GAS Smart Broadcast</span>
          </div>
          <p className="landing-footer-copy">
            © 2026 GAS Smart Broadcast. All rights reserved.
          </p>
        </div>
      </footer>

      <style>{`
        .landing {
          background: var(--color-bg-primary);
          min-height: 100vh;
        }

        /* Nav */
        .landing-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          background: rgba(10, 10, 15, 0.8);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--color-border);
        }
        .landing-nav-inner {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-4) var(--space-6);
        }
        .landing-nav-brand {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .landing-logo-icon {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-lg);
          background: linear-gradient(135deg, var(--color-accent), #8b5cf6);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }
        .landing-logo-text {
          font-size: var(--text-lg);
          font-weight: var(--font-weight-bold);
        }
        .landing-nav-actions {
          display: flex;
          gap: var(--space-2);
        }

        /* Hero */
        .hero {
          position: relative;
          padding: 160px var(--space-6) 100px;
          text-align: center;
          overflow: hidden;
        }
        .hero-glow {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(108, 99, 255, 0.15), transparent 70%);
          pointer-events: none;
        }
        .hero-content {
          position: relative;
          z-index: 2;
          max-width: 700px;
          margin: 0 auto;
        }
        .hero-badge {
          margin-bottom: var(--space-6);
          display: inline-flex;
        }
        .hero-title {
          font-size: 3.5rem;
          font-weight: 800;
          line-height: 1.1;
          margin-bottom: var(--space-6);
          letter-spacing: -0.03em;
        }
        @media (max-width: 768px) {
          .hero-title {
            font-size: 2.5rem;
          }
        }
        .hero-gradient {
          background: linear-gradient(135deg, var(--color-accent), var(--color-whatsapp));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero-desc {
          font-size: var(--text-lg);
          color: var(--color-text-secondary);
          margin-bottom: var(--space-8);
          line-height: var(--line-height-relaxed);
        }
        .hero-actions {
          display: flex;
          gap: var(--space-3);
          justify-content: center;
          margin-bottom: var(--space-6);
        }
        .hero-trust {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          font-size: var(--text-sm);
          color: var(--color-text-muted);
          flex-wrap: wrap;
        }
        .hero-trust-dot {
          color: var(--color-text-muted);
          opacity: 0.4;
        }

        /* Features */
        .features {
          padding: 100px var(--space-6);
        }
        .features-inner {
          max-width: 1200px;
          margin: 0 auto;
        }
        .section-header {
          text-align: center;
          margin-bottom: var(--space-12);
        }
        .section-title {
          font-size: var(--text-3xl);
          font-weight: var(--font-weight-bold);
          margin: var(--space-4) 0 var(--space-3);
        }
        .section-desc {
          font-size: var(--text-md);
          color: var(--color-text-muted);
          max-width: 500px;
          margin: 0 auto;
        }
        .features-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: var(--space-4);
        }
        @media (max-width: 1000px) {
          .features-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 600px) {
          .features-grid {
            grid-template-columns: 1fr;
          }
        }
        .feature-card {
          text-align: center;
          padding: var(--space-8) var(--space-4);
        }
        .feature-icon {
          width: 52px;
          height: 52px;
          border-radius: var(--radius-lg);
          background: var(--color-accent-soft);
          color: var(--color-accent);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto var(--space-4);
        }
        .feature-title {
          font-size: var(--text-md);
          font-weight: var(--font-weight-semibold);
          margin-bottom: var(--space-2);
        }
        .feature-desc {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
          line-height: var(--line-height-relaxed);
        }

        /* Pricing */
        .pricing {
          padding: 100px var(--space-6);
          background: var(--color-bg-secondary);
        }
        .pricing-inner {
          max-width: 1000px;
          margin: 0 auto;
        }
        .pricing-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--space-4);
          align-items: start;
        }
        @media (max-width: 800px) {
          .pricing-grid {
            grid-template-columns: 1fr;
            max-width: 400px;
            margin: 0 auto;
          }
        }
        .pricing-card {
          position: relative;
          text-align: center;
          padding: var(--space-8);
        }
        .pricing-popular {
          position: absolute;
          top: calc(0px - 12px);
          left: 50%;
          transform: translateX(-50%);
        }
        .pricing-name {
          font-size: var(--text-xl);
          font-weight: var(--font-weight-bold);
          margin-bottom: var(--space-1);
        }
        .pricing-desc {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
          margin-bottom: var(--space-4);
        }
        .pricing-price {
          margin-bottom: var(--space-6);
        }
        .pricing-amount {
          font-size: var(--text-4xl);
          font-weight: 800;
          letter-spacing: -0.03em;
        }
        .pricing-period {
          color: var(--color-text-muted);
          font-size: var(--text-sm);
        }
        .pricing-features {
          list-style: none;
          margin-bottom: var(--space-6);
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          text-align: left;
        }
        .pricing-features li {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
        }

        /* CTA */
        .cta-section {
          padding: 100px var(--space-6);
          text-align: center;
        }
        .cta-inner {
          max-width: 600px;
          margin: 0 auto;
        }
        .cta-title {
          font-size: var(--text-3xl);
          margin-bottom: var(--space-4);
        }
        .cta-desc {
          font-size: var(--text-md);
          color: var(--color-text-muted);
          margin-bottom: var(--space-6);
        }

        /* Footer */
        .landing-footer {
          border-top: 1px solid var(--color-border);
          padding: var(--space-6);
        }
        .landing-footer-inner {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .landing-footer-brand {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .landing-footer-copy {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
        }
      `}</style>
    </div>
  );
}
