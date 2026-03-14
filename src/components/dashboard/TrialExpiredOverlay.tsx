'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, ShieldAlert, Sparkles } from 'lucide-react';

export default function TrialExpiredOverlay() {
  return (
    <div className="trial-expired-overlay">
      <div className="overlay-bg-blur" />
      <div className="overlay-content card card-glass">
        <div className="icon-wrapper">
          <div className="icon-glow" />
          <ShieldAlert size={48} className="warn-icon" />
        </div>
        <h1 className="title">Masa Uji Coba Berakhir</h1>
        <p className="description">
          Masa penggunaan gratis selama 20 hari untuk akun Anda telah habis. 
          Silakan upgrade paket langganan Anda untuk kembali mengakses fitur-fitur premium 
          dari GAS Smart Broadcast dan melanjutkan pengiriman pesan tanpa batas.
        </p>
        
        <div className="benefits">
          <h3>Dengan upgrade, Anda akan mendapatkan:</h3>
          <ul>
            <li>✨ Pengiriman pesan tanpa batas per hari</li>
            <li>🤖 Akses ke fitur AI Auto-Reply yang cerdas</li>
            <li>📱 Penggunaan multi-device dan integrasi REST API</li>
            <li>📊 Laporan detail dan prioritas customer support</li>
          </ul>
        </div>

        <div className="actions">
          <Link href="/dashboard/settings" className="btn btn-primary btn-lg upgrade-btn">
            <Sparkles size={18} />
            Upgrade Sekarang
            <ArrowRight size={18} />
          </Link>
          <a
            href="https://wa.me/6281234567890" // Ganti dengan nomor CS/Admin yang sebenarnya jika diperlukan
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost help-link"
          >
            Hubungi Customer Service
          </a>
        </div>
      </div>

      <style jsx>{`
        .trial-expired-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-4);
          background: rgba(8, 10, 20, 0.85);
          backdrop-filter: blur(12px);
          animation: fadeIn 0.4s ease-out;
        }

        .overlay-bg-blur {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, rgba(220, 38, 38, 0.1) 0%, transparent 60%);
          pointer-events: none;
        }

        .overlay-content {
          position: relative;
          z-index: 10;
          max-width: 560px;
          width: 100%;
          padding: var(--space-8);
          text-align: center;
          border-radius: var(--radius-2xl);
          background: linear-gradient(145deg, rgba(30, 35, 55, 0.9) 0%, rgba(15, 20, 35, 0.95) 100%);
          border: 1px solid rgba(220, 38, 38, 0.2);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(220, 38, 38, 0.1);
          animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .icon-wrapper {
          position: relative;
          width: 80px;
          height: 80px;
          margin: 0 auto var(--space-6);
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(220, 38, 38, 0.1);
          border-radius: 50%;
          color: var(--color-danger);
        }

        .icon-glow {
          position: absolute;
          inset: -20px;
          background: radial-gradient(circle, rgba(220, 38, 38, 0.3) 0%, transparent 70%);
          animation: pulse 2s ease-in-out infinite;
        }

        .warn-icon {
          position: relative;
          z-index: 2;
        }

        .title {
          font-size: var(--text-3xl);
          font-weight: 800;
          color: white;
          margin-bottom: var(--space-3);
          letter-spacing: -0.02em;
        }

        .description {
          font-size: var(--text-md);
          color: var(--color-text-secondary);
          line-height: 1.6;
          margin-bottom: var(--space-8);
          max-width: 480px;
          margin-left: auto;
          margin-right: auto;
        }

        .benefits {
          text-align: left;
          background: rgba(0, 0, 0, 0.2);
          padding: var(--space-5);
          border-radius: var(--radius-xl);
          border: 1px solid rgba(255, 255, 255, 0.05);
          margin-bottom: var(--space-8);
        }

        .benefits h3 {
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--color-text-primary);
          margin-bottom: var(--space-3);
        }

        .benefits ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .benefits li {
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .actions {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }

        .upgrade-btn {
          width: 100%;
          background: linear-gradient(135deg, var(--color-accent) 0%, a855f7 100%);
          box-shadow: 0 4px 15px rgba(108, 99, 255, 0.3);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .upgrade-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(108, 99, 255, 0.4);
        }

        .help-link {
          font-size: var(--text-sm);
          color: var(--color-text-muted);
        }

        .help-link:hover {
          color: white;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.2); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
