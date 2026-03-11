'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
    Bell,
    Search,
    ChevronDown,
    User,
    Settings,
    LogOut,
    Moon,
} from 'lucide-react';
import type { Profile, Tenant } from '@/types';

interface HeaderProps {
    profile: Profile | null;
    tenant: Tenant | null;
}

export default function Header({ profile, tenant }: HeaderProps) {
    const [showUserMenu, setShowUserMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const supabase = createClient();

    // Close menu on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowUserMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
        router.refresh();
    };

    const initials = profile?.full_name
        ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : 'U';

    return (
        <header className="topbar">
            {/* Left — Search */}
            <div className="topbar-search">
                <div className="search-wrapper">
                    <Search size={16} className="search-icon" />
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Cari kontak, campaign..."
                    />
                </div>
            </div>

            {/* Right — Actions */}
            <div className="topbar-actions">
                {/* Plan badge */}
                <a href="/dashboard/settings" className="badge badge-accent" style={{ textTransform: 'capitalize', textDecoration: 'none', cursor: 'pointer' }}>
                    {tenant?.plan || 'free'} plan
                </a>

                {/* Notifications */}
                <button className="btn btn-ghost btn-icon btn-sm" title="Notifikasi">
                    <Bell size={18} />
                </button>

                {/* User Menu */}
                <div className="dropdown" ref={menuRef}>
                    <button
                        className="topbar-user-btn"
                        onClick={() => setShowUserMenu(!showUserMenu)}
                    >
                        <div className="avatar avatar-sm">
                            {initials}
                        </div>
                        <span className="topbar-user-name">
                            {profile?.full_name || 'User'}
                        </span>
                        <ChevronDown size={14} />
                    </button>

                    {showUserMenu && (
                        <div className="dropdown-menu">
                            <div className="dropdown-header">
                                <span className="dropdown-header-name">
                                    {profile?.full_name || 'User'}
                                </span>
                                <span className="dropdown-header-role">
                                    {profile?.role || 'member'}
                                </span>
                            </div>
                            <div className="dropdown-divider" />
                            <button className="dropdown-item" onClick={() => { router.push('/dashboard/settings'); setShowUserMenu(false); }}>
                                <User size={16} />
                                Profil
                            </button>
                            <button className="dropdown-item" onClick={() => { router.push('/dashboard/settings'); setShowUserMenu(false); }}>
                                <Settings size={16} />
                                Pengaturan
                            </button>
                            <div className="dropdown-divider" />
                            <button className="dropdown-item" onClick={handleLogout} style={{ color: 'var(--color-danger)' }}>
                                <LogOut size={16} />
                                Keluar
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
        .topbar {
          height: var(--header-height);
          background: var(--color-bg-secondary);
          border-bottom: 1px solid var(--color-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-6);
          position: sticky;
          top: 0;
          z-index: var(--z-sticky);
        }
        .topbar-search {
          flex: 1;
          max-width: 400px;
        }
        .topbar-actions {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .topbar-user-btn {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-1) var(--space-2);
          background: none;
          border: 1px solid transparent;
          border-radius: var(--radius-md);
          cursor: pointer;
          color: var(--color-text-secondary);
          transition: all var(--transition-fast);
        }
        .topbar-user-btn:hover {
          background: var(--color-bg-hover);
          border-color: var(--color-border);
        }
        .topbar-user-name {
          font-size: var(--text-sm);
          font-weight: var(--font-weight-medium);
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dropdown {
          position: relative;
        }
        .dropdown-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          min-width: 200px;
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-1);
          box-shadow: var(--shadow-lg);
          z-index: var(--z-dropdown);
          animation: fadeIn 0.15s ease;
        }
        .dropdown-header {
          padding: var(--space-3);
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .dropdown-header-name {
          font-size: var(--text-sm);
          font-weight: var(--font-weight-semibold);
          color: var(--color-text-primary);
        }
        .dropdown-header-role {
          font-size: var(--text-xs);
          color: var(--color-text-muted);
          text-transform: capitalize;
        }
        .dropdown-divider {
          height: 1px;
          background: var(--color-border);
          margin: var(--space-1) 0;
        }
        .dropdown-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all var(--transition-fast);
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          font-family: var(--font-sans);
        }
        .dropdown-item:hover {
          background: var(--color-bg-hover);
          color: var(--color-text-primary);
        }
      `}</style>
        </header>
    );
}
