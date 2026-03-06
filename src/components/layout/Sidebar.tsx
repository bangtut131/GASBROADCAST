'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Smartphone,
  Users,
  Send,
  MessageSquare,
  Inbox,
  Bot,
  Key,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  BarChart2,
  UserCheck,
  Radio,
} from 'lucide-react';


interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={20} /> },
  { label: 'Devices', href: '/dashboard/devices', icon: <Smartphone size={20} /> },
  { label: 'Contacts', href: '/dashboard/contacts', icon: <Users size={20} /> },
  { label: 'Broadcast', href: '/dashboard/broadcast', icon: <Send size={20} /> },
  { label: 'WA Status', href: '/dashboard/wa-status', icon: <Radio size={20} /> },
  { label: 'Inbox', href: '/dashboard/inbox', icon: <Inbox size={20} /> },
  { label: 'Multi-CS', href: '/dashboard/cs', icon: <UserCheck size={20} /> },
  { label: 'Auto Reply', href: '/dashboard/auto-reply', icon: <Bot size={20} /> },
  { label: 'Analytics', href: '/dashboard/analytics', icon: <BarChart2 size={20} /> },
  { label: 'API Keys', href: '/dashboard/api-keys', icon: <Key size={20} /> },
  { label: 'Settings', href: '/dashboard/settings', icon: <Settings size={20} /> },
];


export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <MessageSquare size={22} />
        </div>
        {!collapsed && (
          <span className="sidebar-logo-text">WA Broadcast</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              {!collapsed && (
                <>
                  <span className="sidebar-nav-label">{item.label}</span>
                  {item.badge && (
                    <span className="sidebar-nav-badge">{item.badge}</span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Upgrade Banner (non-collapsed) */}
      {!collapsed && (
        <div className="sidebar-upgrade">
          <div className="sidebar-upgrade-icon">
            <Zap size={18} />
          </div>
          <div className="sidebar-upgrade-text">
            <span className="sidebar-upgrade-title">Upgrade Plan</span>
            <span className="sidebar-upgrade-desc">Unlock semua fitur</span>
          </div>
        </div>
      )}

      {/* Collapse Toggle */}
      <button
        className="sidebar-toggle"
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <style jsx>{`
        .sidebar {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: var(--sidebar-width);
          background: var(--color-bg-secondary);
          border-right: 1px solid var(--color-border);
          display: flex;
          flex-direction: column;
          padding: var(--space-4);
          transition: width var(--transition-slow);
          z-index: var(--z-sticky);
          overflow-y: auto;
          overflow-x: hidden;
        }
        .sidebar-collapsed {
          width: var(--sidebar-collapsed-width);
          padding: var(--space-4) var(--space-2);
        }

        /* Logo */
        .sidebar-logo {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-2) var(--space-2);
          margin-bottom: var(--space-6);
          flex-shrink: 0;
        }
        .sidebar-logo-icon {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-lg);
          background: linear-gradient(135deg, var(--color-accent), #8b5cf6);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          flex-shrink: 0;
        }
        .sidebar-logo-text {
          font-size: var(--text-md);
          font-weight: var(--font-weight-bold);
          color: var(--color-text-primary);
          white-space: nowrap;
        }

        /* Navigation */
        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
          flex: 1;
        }
        .sidebar-nav-item {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-md);
          color: var(--color-text-muted);
          font-size: var(--text-sm);
          font-weight: var(--font-weight-medium);
          transition: all var(--transition-fast);
          text-decoration: none;
          white-space: nowrap;
          min-height: 40px;
        }
        .sidebar-nav-item:hover {
          background: var(--color-bg-hover);
          color: var(--color-text-primary);
        }
        .sidebar-nav-item.active {
          background: var(--color-accent-soft);
          color: var(--color-accent);
        }
        .sidebar-nav-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          width: 20px;
        }
        .sidebar-nav-label {
          flex: 1;
        }
        .sidebar-nav-badge {
          padding: 1px 6px;
          font-size: var(--text-xs);
          font-weight: var(--font-weight-semibold);
          background: var(--color-accent);
          color: white;
          border-radius: var(--radius-full);
        }

        /* Upgrade Banner */
        .sidebar-upgrade {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3);
          background: linear-gradient(135deg, rgba(108, 99, 255, 0.15), rgba(139, 92, 246, 0.15));
          border: 1px solid rgba(108, 99, 255, 0.3);
          border-radius: var(--radius-lg);
          margin-top: var(--space-4);
          margin-bottom: var(--space-4);
          cursor: pointer;
          transition: all var(--transition-base);
          flex-shrink: 0;
        }
        .sidebar-upgrade:hover {
          border-color: var(--color-accent);
          box-shadow: var(--shadow-glow);
        }
        .sidebar-upgrade-icon {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-md);
          background: var(--color-accent);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          flex-shrink: 0;
        }
        .sidebar-upgrade-text {
          display: flex;
          flex-direction: column;
        }
        .sidebar-upgrade-title {
          font-size: var(--text-sm);
          font-weight: var(--font-weight-semibold);
          color: var(--color-text-primary);
        }
        .sidebar-upgrade-desc {
          font-size: var(--text-xs);
          color: var(--color-text-muted);
        }

        /* Toggle */
        .sidebar-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: var(--radius-full);
          border: 1px solid var(--color-border);
          background: var(--color-bg-tertiary);
          color: var(--color-text-muted);
          cursor: pointer;
          position: absolute;
          top: 50%;
          right: -14px;
          transform: translateY(-50%);
          transition: all var(--transition-fast);
          z-index: 10;
        }
        .sidebar-toggle:hover {
          background: var(--color-bg-hover);
          border-color: var(--color-border-hover);
          color: var(--color-text-primary);
        }
      `}</style>
    </aside>
  );
}
