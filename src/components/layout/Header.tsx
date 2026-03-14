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
    LogOut
} from 'lucide-react';
import type { Profile, Tenant } from '@/types';
import { formatTimeAgo } from '@/lib/utils';

interface HeaderProps {
    profile: Profile | null;
    tenant: Tenant | null;
}

export default function Header({ profile, tenant }: HeaderProps) {
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showNotifMenu, setShowNotifMenu] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]);
    
    const menuRef = useRef<HTMLDivElement>(null);
    const notifRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const supabase = createClient();

    useEffect(() => {
        // Fetch Notifications
        const fetchNotifications = async () => {
            try {
                const res = await fetch('/api/notifications');
                const result = await res.json();
                if (result.success) {
                    setNotifications(result.data || []);
                }
            } catch (err) {
                console.error('Failed to fetch notifications', err);
            }
        };

        if (tenant) fetchNotifications();
    }, [tenant]);

    // Close menu on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowUserMenu(false);
            }
            if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
                setShowNotifMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMarkAsRead = async (id?: string) => {
        try {
            const body = id ? { id } : { markAllRead: true };
            const res = await fetch('/api/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const result = await res.json();
            if (result.success) {
                if (id) {
                    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
                } else {
                    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
                }
            }
        } catch (err) {
            console.error('Failed to mark read', err);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
        router.refresh();
    };

    const initials = profile?.full_name
        ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : 'U';

    const unreadCount = notifications.filter(n => !n.is_read).length;

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
                <div className="dropdown" ref={notifRef}>
                    <button 
                        className="btn btn-ghost btn-icon btn-sm notif-btn" 
                        title="Notifikasi"
                        onClick={() => {
                            setShowNotifMenu(!showNotifMenu);
                            setShowUserMenu(false);
                        }}
                    >
                        <Bell size={18} />
                        {unreadCount > 0 && (
                            <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                        )}
                    </button>

                    {showNotifMenu && (
                        <div className="dropdown-menu notif-dropdown">
                            <div className="dropdown-header" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span className="dropdown-header-name">Notifikasi</span>
                                {unreadCount > 0 && (
                                    <button 
                                        className="btn btn-ghost btn-xs text-primary" 
                                        onClick={() => handleMarkAsRead()}
                                        style={{ fontSize: '11px', padding: '0 4px' }}
                                    >
                                        Tandai semua dibaca
                                    </button>
                                )}
                            </div>
                            <div className="dropdown-divider" style={{ marginTop: 0 }} />
                            
                            <div className="notif-list">
                                {notifications.length > 0 ? (
                                    notifications.map(notif => (
                                        <div 
                                            key={notif.id} 
                                            className={`notif-item ${notif.is_read ? 'read' : 'unread'}`}
                                            onClick={() => !notif.is_read && handleMarkAsRead(notif.id)}
                                        >
                                            <div className="notif-content">
                                                <span className="notif-title">{notif.title}</span>
                                                <p className="notif-message">{notif.message}</p>
                                                <span className="notif-time">{formatTimeAgo(notif.created_at)}</span>
                                            </div>
                                            {!notif.is_read && <div className="notif-dot" />}
                                        </div>
                                    ))
                                ) : (
                                    <div className="notif-empty">
                                        <Bell size={24} style={{ opacity: 0.2, marginBottom: '8px' }} />
                                        <p>Tidak ada notifikasi</p>
                                    </div>
                                )}
                            </div>
                            
                            <div className="dropdown-divider" style={{ marginBottom: 0 }} />
                            <div className="dropdown-footer">
                                <button className="btn btn-ghost btn-sm" style={{ width: '100%', fontSize: '12px' }} onClick={() => setShowNotifMenu(false)}>
                                    Tutup
                                </button>
                            </div>
                        </div>
                    )}
                </div>

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
        .notif-btn {
          position: relative;
        }
        .notif-badge {
          position: absolute;
          top: 2px;
          right: 2px;
          background: var(--color-danger);
          color: white;
          font-size: 10px;
          font-weight: bold;
          border-radius: 10px;
          padding: 0 4px;
          min-width: 14px;
          height: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid var(--color-bg-secondary);
        }
        .notif-dropdown {
          width: 320px;
          padding: 0;
          overflow: hidden;
        }
        .notif-list {
          max-height: 350px;
          overflow-y: auto;
        }
        .notif-empty {
          padding: var(--space-6);
          text-align: center;
          color: var(--color-text-muted);
          font-size: var(--text-sm);
        }
        .notif-item {
          padding: var(--space-3);
          border-bottom: 1px solid var(--color-border);
          display: flex;
          gap: var(--space-2);
          cursor: pointer;
          transition: background 0.15s;
        }
        .notif-item:last-child {
          border-bottom: none;
        }
        .notif-item:hover {
          background: var(--color-bg-hover);
        }
        .notif-item.unread {
          background: rgba(var(--color-primary-rgb), 0.05);
        }
        .notif-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .notif-title {
          font-size: var(--text-sm);
          font-weight: var(--font-weight-semibold);
          color: var(--color-text-primary);
        }
        .notif-message {
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
          margin: 0;
          line-height: 1.4;
        }
        .notif-time {
          font-size: 11px;
          color: var(--color-text-muted);
          margin-top: 4px;
        }
        .notif-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--color-primary);
          margin-top: 6px;
        }
        .dropdown-footer {
          padding: var(--space-1);
          background: var(--color-bg-secondary);
        }
      `}</style>
        </header>
    );
}
