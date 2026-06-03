'use client';

import { useState } from 'react';
import { usePathname, useParams } from 'next/navigation';
import Link from 'next/link';

type NavUser = {
  email: string;
  role: string;
};

type NavBarProps = {
  user: NavUser;
  defaultChannelSlug: string | null;
};

export function NavBar({ user, defaultChannelSlug }: NavBarProps) {
  const pathname = usePathname();
  const params = useParams();
  const [mobileOpen, setMobileOpen] = useState(false);

  const channelSlug = (params?.channelSlug as string | undefined) ?? defaultChannelSlug;

  const links = [
    {
      label: 'Dashboard',
      href: channelSlug ? `/dashboard/${encodeURIComponent(channelSlug)}` : '/dashboard',
    },
    {
      label: 'Alerts',
      href: channelSlug ? `/dashboard/${encodeURIComponent(channelSlug)}/alerts` : '/dashboard',
    },
    {
      label: 'Assets',
      href: channelSlug ? `/dashboard/${encodeURIComponent(channelSlug)}/assets` : '/dashboard',
    },
    {
      label: 'Integrations',
      href: channelSlug
        ? `/dashboard/${encodeURIComponent(channelSlug)}/integrations`
        : '/dashboard',
    },
    {
      label: 'Settings',
      href: channelSlug ? `/dashboard/${encodeURIComponent(channelSlug)}/settings` : '/dashboard',
    },
    { label: 'Overlay', href: '/overlay' },
  ];

  const isActive = (href: string): boolean => {
    if (!pathname) return false;
    if (href === pathname) return true;
    if (href !== '/dashboard' && pathname.startsWith(href)) return true;
    if (href === '/dashboard' && pathname === '/dashboard') return true;
    return false;
  };

  return (
    <nav className="nav-bar" aria-label="Main">
      <div className="nav-brand">
        <Link href="/dashboard">GitcheGumi Alerts</Link>
      </div>

      <button
        type="button"
        className="nav-hamburger"
        aria-label="Toggle menu"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((v) => !v)}
      >
        <span />
        <span />
        <span />
      </button>

      <div className={`nav-links${mobileOpen ? ' nav-mobile-open' : ''}`}>
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className={`nav-link${isActive(link.href) ? ' nav-link-active' : ''}`}
            aria-current={isActive(link.href) ? 'page' : undefined}
            onClick={() => setMobileOpen(false)}
          >
            {link.label}
          </Link>
        ))}
        {user.role === 'admin' && (
          <Link
            href="/dashboard/admin/invites"
            className={`nav-link${pathname?.startsWith('/dashboard/admin') ? ' nav-link-active' : ''}`}
            aria-current={pathname?.startsWith('/dashboard/admin') ? 'page' : undefined}
            onClick={() => setMobileOpen(false)}
          >
            Invite Codes
          </Link>
        )}
      </div>

      <div className="nav-user">
        <span className="nav-user-email" title={user.email}>
          {user.email}
        </span>
        <a className="nav-signout" href="/api/auth/signout">
          Sign out
        </a>
      </div>
    </nav>
  );
}
