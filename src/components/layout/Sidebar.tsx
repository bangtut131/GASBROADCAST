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
  Crown,
  MapPin,
} from 'lucide-react';
import s from './Sidebar.module.css';

interface SidebarProps {
  isAdmin?: boolean;
  plan?: string;
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
      { label: 'Leads Scraper', href: '/dashboard/leads', icon: <MapPin size={20} />, badge: 'New' },
      { label: 'Multi-CS', href: '/dashboard/cs', icon: <UserCheck size={20} /> },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'API Keys', href: '/dashboard/api-keys', icon: <Key size={20} /> },
      { label: 'Settings', href: '/dashboard/settings', icon: <Settings size={20} /> },
      { label: 'Admin Panel', href: '/admin', icon: <Crown size={20} />, badge: '👑' },
    ],
  },
];

export default function Sidebar({ isAdmin, plan = 'free' }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside className={`${s.sidebar} ${collapsed ? s.sidebarCollapsed : ''}`}>
      {/* Logo */}
      <div className={s.logo}>
        <div className={s.logoIcon}>
          <img src="/logo.png" alt="GAS Broadcast Logo" style={{ height: collapsed ? '28px' : '32px', width: 'auto', objectFit: 'contain' }} />
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
        {navSections.map((section, si) => {
          // Filter section items based on plan
          const filteredItems = section.items.filter(item => {
              // Admin Panel logic
              if (item.href === '/admin' && !isAdmin) return false;
              
              // Plan-based exclusions
              if (plan === 'free') {
                  if (item.label === 'Auto Reply') return false; // Exclude Auto Reply for Free
                  if (item.label === 'Multi-CS') return false;   // Exclude Multi-CS for Free
              }
              
              return true;
          });

          // Don't render empty sections
          if (filteredItems.length === 0) return null;

          return (
            <div className={s.section} key={si}>
              {!collapsed && (
                <div className={s.sectionTitle}>{section.title}</div>
              )}
              {collapsed && si > 0 && <div className={s.sectionDot} />}
              {filteredItems.map((item) => {
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
          );
        })}
      </nav>

      {/* Upgrade Banner */}
      {!collapsed && (
        <a href="/dashboard/settings" className={s.upgrade} style={{ textDecoration: 'none', cursor: 'pointer' }}>
          <div className={s.upgradeGlow} />
          <div className={s.upgradeIcon}>
            <Sparkles size={18} />
          </div>
          <div className={s.upgradeTextWrap}>
            <span className={s.upgradeTitle}>Kelola Langganan</span>
            <span className={s.upgradeDesc}>Lihat paket & upgrade</span>
          </div>
        </a>
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
