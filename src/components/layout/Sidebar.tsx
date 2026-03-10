'use client';

import { useState } from 'react';
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
  BarChart2,
  UserCheck,
  Radio,
  Sparkles,
} from 'lucide-react';
import s from './Sidebar.module.css';

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
    <aside className={`${s.sidebar} ${collapsed ? s.sidebarCollapsed : ''}`}>
      {/* Logo */}
      <div className={s.logo}>
        <div className={s.logoIcon}>
          <MessageSquare size={collapsed ? 20 : 22} />
        </div>
        {!collapsed && (
          <div className={s.logoTextWrap}>
            <span className={s.logoText}>GAS Smart Broadcast</span>
            <span className={s.logoVersion}>v1.0</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className={s.nav}>
        {navSections.map((section, si) => (
          <div className={s.section} key={si}>
            {!collapsed && (
              <div className={s.sectionTitle}>{section.title}</div>
            )}
            {collapsed && si > 0 && <div className={s.sectionDot} />}
            {section.items.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${s.navItem} ${isActive ? s.navItemActive : ''}`}
                  title={collapsed ? item.label : undefined}
                >
                  <span className={s.navIcon}>{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span className={s.navLabel}>{item.label}</span>
                      {item.badge && (
                        <span className={s.navBadge}>{item.badge}</span>
                      )}
                    </>
                  )}
                  {isActive && <span className={s.indicator} />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Upgrade Banner */}
      {!collapsed && (
        <div className={s.upgrade}>
          <div className={s.upgradeGlow} />
          <div className={s.upgradeIcon}>
            <Sparkles size={18} />
          </div>
          <div className={s.upgradeTextWrap}>
            <span className={s.upgradeTitle}>Upgrade to Pro</span>
            <span className={s.upgradeDesc}>Unlock unlimited devices</span>
          </div>
        </div>
      )}

      {/* Collapse Toggle */}
      <button
        className={s.toggle}
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </aside>
  );
}
