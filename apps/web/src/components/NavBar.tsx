'use client';

import { useState } from 'react';
import { usePathname, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { getVersionStatus } from '@/lib/update-check';

type NavUser = {
  email: string;
  role: string;
};

type NavVersionStatus = Awaited<ReturnType<typeof getVersionStatus>>;

type NavBarProps = {
  user: NavUser;
  defaultChannelSlug: string | null;
  versionStatus: NavVersionStatus;
};

export function NavBar({ user, defaultChannelSlug, versionStatus }: NavBarProps) {
  const pathname = usePathname();
  const params = useParams();
  const [mobileOpen, setMobileOpen] = useState(false);

  const channelSlug = (params?.channelSlug as string | undefined) ?? defaultChannelSlug;
  const updateLabel = getUpdateLabel(versionStatus.update.status);
  const updateClass = getUpdateClass(versionStatus.update.status);
  const latestLabel = versionStatus.update.latest?.tagName ?? null;
  const guideUrl =
    process.env.NEXT_PUBLIC_DOCS_URL ?? 'https://gitchegumi.github.io/multi-stream-alerts/';
  const statusTitle = latestLabel
    ? `${versionStatus.build.releaseTag} deployed. Latest release: ${latestLabel}.`
    : `${versionStatus.build.releaseTag} deployed. Update status: ${updateLabel}.`;

  const links = [
    {
      label: 'Dashboard',
      href: channelSlug ? `/dashboard/${encodeURIComponent(channelSlug)}` : '/dashboard',
      exact: true,
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
      label: 'Settings',
      href: channelSlug ? `/dashboard/${encodeURIComponent(channelSlug)}/settings` : '/dashboard',
    },
    {
      label: 'Guide',
      href: guideUrl,
    },
  ];

  const isActive = (href: string, exact = false): boolean => {
    if (!pathname) return false;
    if (href === pathname) return true;
    if (exact) return false;
    if (href !== '/dashboard' && pathname.startsWith(href)) return true;
    if (href === '/dashboard' && pathname === '/dashboard') return true;
    return false;
  };

  return (
    <nav className="nav-bar" aria-label="Main">
      <div className="nav-brand">
        <Link href="/" aria-label="GitcheGumi Alerts – Home">
          <Image src="/logo.svg" alt="GitcheGumi Alerts logo" width={320} height={80} priority />
        </Link>
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
            className={`nav-link${isActive(link.href, link.exact) ? ' nav-link-active' : ''}`}
            aria-current={isActive(link.href, link.exact) ? 'page' : undefined}
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
        <div className="nav-release" title={statusTitle} aria-label={statusTitle}>
          <span className="nav-release-version">{versionStatus.build.releaseTag}</span>
          <span className={`pill ${updateClass}`}>{updateLabel}</span>
        </div>
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

function getUpdateLabel(status: NavVersionStatus['update']['status']) {
  switch (status) {
    case 'update-available':
      return 'Update available';
    case 'up-to-date':
      return 'Up to date';
    case 'disabled':
      return 'Updates off';
    default:
      return 'Update unknown';
  }
}

function getUpdateClass(status: NavVersionStatus['update']['status']) {
  switch (status) {
    case 'update-available':
      return 'pill-warn';
    case 'up-to-date':
      return 'pill-ok';
    default:
      return 'pill-muted';
  }
}
