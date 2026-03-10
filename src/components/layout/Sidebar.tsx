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
  Sparkles,
  LogOut,
} from 'lucide-react';


interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  section?: string;
}

const navSections = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={20} /> },
      { label: 'Analytics', href: '/dashboard/analytics', icon: <BarChart2 size={20} /> },
    ],
  },
  {
    title: 'Messaging',
    items: [
      { label: 'Broadcast', href: '/dashboard/broadcast', icon: <Send size={20} /> },
      { label: 'WA Status', href: '/dashboard/wa-status', icon: <Radio size={20} />, badge: 'New' },
      { label: 'Inbox', href: '/dashboard/inbox', icon: <Inbox size={20} /> },
      { label: 'Auto Reply', href: '/dashboard/auto-reply', icon: <Bot size={20} /> },
    ],
  },
  {
    title: 'Manage',
    items: [
      { label: 'Devices', href: '/dashboard/devices', icon: <Smartphone size={20} /> },
      { label: 'Contacts', href: '/dashboard/contacts', icon: <Users size={20} /> },
      { label: 'Multi-CS', href: '/dashboard/cs', icon: <UserCheck size={20} /> },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'API Keys', href: '/dashboard/api-keys', icon: <Key size={20} /> },
      { label: 'Settings', href: '/dashboard/settings', icon: <Settings size={20} /> },
    ],
  },
];


export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <MessageSquare size={collapsed ? 20 : 22} />
        </div>
        {!collapsed && (
          <div className="sidebar-logo-text-wrap">
            <span className="sidebar-logo-text">GasBroadcast</span>
            <span className="sidebar-logo-version">v1.0</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navSections.map((section, si) => (
          <div className="sidebar-section" key={si}>
            {!collapsed && (
              <div className="sidebar-section-title">{section.title}</div>
            )}
            {collapsed && si > 0 && <div className="sidebar-section-dot" />}
            {section.items.map((item) => {
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
                  {isActive && <span className="sidebar-nav-indicator" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Upgrade Banner (non-collapsed) */}
      {!collapsed && (
        <div className="sidebar-upgrade">
          <div className="sidebar-upgrade-glow" />
          <div className="sidebar-upgrade-icon">
            <Sparkles size={18} />
          </div>
          <div className="sidebar-upgrade-text">
            <span className="sidebar-upgrade-title">Upgrade to Pro</span>
            <span className="sidebar-upgrade-desc">Unlock unlimited devices</span>
          </div>
        </div>
      )}

      {/* Collapse Toggle */}
      <button
        className="sidebar-toggle"
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <style jsx>{`
        .sidebar {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: var(--sidebar-width);
          background: linear-gradient(180deg, 
            rgba(15, 15, 25, 0.97) 0%, 
            rgba(10, 10, 20, 0.99) 100%
          );
          backdrop-filter: blur(20px);
          border-right: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          flex-direction: column;
          padding: var(--space-4) var(--space-3);
          transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: var(--z-sticky);
          overflow-y: auto;
          overflow-x: hidden;
        }
        .sidebar::-webkit-scrollbar {
          width: 4px;
        }
        .sidebar::-webkit-scrollbar-track {
          background: transparent;
        }
        .sidebar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 4px;
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
          padding: var(--space-2);
          margin-bottom: var(--space-5);
          flex-shrink: 0;
        }
        .sidebar-logo-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: linear-gradient(135deg, #6C63FF 0%, #a855f7 50%, #ec4899 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          flex-shrink: 0;
          box-shadow: 0 4px 15px rgba(108, 99, 255, 0.35);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .sidebar-logo:hover .sidebar-logo-icon {
          transform: scale(1.05) rotate(-3deg);
          box-shadow: 0 6px 20px rgba(108, 99, 255, 0.5);
        }
        .sidebar-logo-text-wrap {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .sidebar-logo-text {
          font-size: 16px;
          font-weight: 700;
          color: #fff;
          white-space: nowrap;
          letter-spacing: -0.3px;
        }
        .sidebar-logo-version {
          font-size: 10px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.35);
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        /* Navigation */
        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
          flex: 1;
        }
        .sidebar-section {
          margin-bottom: var(--space-2);
        }
        .sidebar-section-title {
          padding: var(--space-2) var(--space-3);
          font-size: 10px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.3);
          text-transform: uppercase;
          letter-spacing: 1.2px;
          user-select: none;
        }
        .sidebar-section-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.15);
          margin: var(--space-2) auto;
        }
        .sidebar-nav-item {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: 10px 12px;
          border-radius: 10px;
          color: rgba(255, 255, 255, 0.55);
          font-size: 13.5px;
          font-weight: 500;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          text-decoration: none;
          white-space: nowrap;
          min-height: 40px;
          position: relative;
          overflow: hidden;
        }
        .sidebar-nav-item::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 10px;
          background: linear-gradient(135deg, rgba(108, 99, 255, 0.12), rgba(168, 85, 247, 0.08));
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .sidebar-nav-item:hover {
          color: rgba(255, 255, 255, 0.95);
        }
        .sidebar-nav-item:hover::before {
          opacity: 1;
        }
        .sidebar-nav-item:hover .sidebar-nav-icon {
          transform: scale(1.1);
        }
        .sidebar-nav-item.active {
          color: #fff;
          background: linear-gradient(135deg, rgba(108, 99, 255, 0.2), rgba(168, 85, 247, 0.15));
          box-shadow: 0 0 0 1px rgba(108, 99, 255, 0.25), 
                      inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }
        .sidebar-nav-item.active::before {
          opacity: 0;
        }
        .sidebar-nav-indicator {
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 3px;
          height: 20px;
          border-radius: 0 3px 3px 0;
          background: linear-gradient(180deg, #6C63FF, #a855f7);
          box-shadow: 0 0 8px rgba(108, 99, 255, 0.6);
        }
        .sidebar-nav-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          width: 20px;
          position: relative;
          z-index: 1;
          transition: transform 0.2s ease;
        }
        .sidebar-nav-label {
          flex: 1;
          position: relative;
          z-index: 1;
        }
        .sidebar-nav-badge {
          padding: 2px 8px;
          font-size: 10px;
          font-weight: 600;
          background: linear-gradient(135deg, #6C63FF, #a855f7);
          color: white;
          border-radius: 20px;
          position: relative;
          z-index: 1;
          letter-spacing: 0.3px;
          box-shadow: 0 2px 8px rgba(108, 99, 255, 0.35);
        }

        /* Upgrade Banner */
        .sidebar-upgrade {
          position: relative;
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: 14px 14px;
          background: linear-gradient(135deg, 
            rgba(108, 99, 255, 0.12) 0%, 
            rgba(168, 85, 247, 0.1) 50%,
            rgba(236, 72, 153, 0.08) 100%
          );
          border: 1px solid rgba(108, 99, 255, 0.2);
          border-radius: 14px;
          margin-top: var(--space-3);
          margin-bottom: var(--space-3);
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          flex-shrink: 0;
          overflow: hidden;
        }
        .sidebar-upgrade-glow {
          position: absolute;
          width: 60px;
          height: 60px;
          background: radial-gradient(circle, rgba(108, 99, 255, 0.3), transparent 70%);
          top: -20px;
          right: -10px;
          pointer-events: none;
        }
        .sidebar-upgrade:hover {
          border-color: rgba(108, 99, 255, 0.4);
          background: linear-gradient(135deg, 
            rgba(108, 99, 255, 0.18) 0%, 
            rgba(168, 85, 247, 0.15) 50%,
            rgba(236, 72, 153, 0.12) 100%
          );
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(108, 99, 255, 0.2);
        }
        .sidebar-upgrade-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: linear-gradient(135deg, #6C63FF, #a855f7);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          flex-shrink: 0;
          box-shadow: 0 3px 10px rgba(108, 99, 255, 0.3);
          position: relative;
          z-index: 1;
        }
        .sidebar-upgrade-text {
          display: flex;
          flex-direction: column;
          position: relative;
          z-index: 1;
        }
        .sidebar-upgrade-title {
          font-size: 13px;
          font-weight: 600;
          color: #fff;
        }
        .sidebar-upgrade-desc {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.45);
        }

        /* Toggle */
        .sidebar-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.4);
          cursor: pointer;
          position: absolute;
          top: 50%;
          right: -13px;
          transform: translateY(-50%);
          transition: all 0.2s ease;
          z-index: 10;
          backdrop-filter: blur(10px);
        }
        .sidebar-toggle:hover {
          background: rgba(108, 99, 255, 0.2);
          border-color: rgba(108, 99, 255, 0.4);
          color: #fff;
          box-shadow: 0 0 12px rgba(108, 99, 255, 0.3);
        }
      `}</style>
    </aside>
  );
}
