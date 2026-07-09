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

export function isActive(pathname: string | null, href: string, exact = false): boolean {
  if (!pathname) return false;
  if (href === pathname) return true;
  if (exact) return false;
  if (href !== '/dashboard' && pathname.startsWith(href)) return true;
  if (href === '/dashboard' && pathname === '/dashboard') return true;
  return false;
}

export function buildNavLinks(
  channelSlug: string | null,
): { label: string; href: string; exact?: boolean }[] {
  const base = channelSlug ? `/dashboard/${encodeURIComponent(channelSlug)}` : '/dashboard';
  return [
    { label: 'Dashboard', href: base, exact: true },
    { label: 'Alerts', href: channelSlug ? `${base}/alerts` : '/dashboard' },
    { label: 'Assets', href: channelSlug ? `${base}/assets` : '/dashboard' },
    { label: 'Settings', href: channelSlug ? `${base}/settings` : '/dashboard' },
    { label: 'Guide', href: channelSlug ? `${base}/guide` : '/dashboard' },
  ];
}

export function NavBar({ user, defaultChannelSlug, versionStatus }: NavBarProps) {
  const pathname = usePathname();
  const params = useParams();
  const [mobileOpen, setMobileOpen] = useState(false);

  const channelSlug = (params?.channelSlug as string | undefined) ?? defaultChannelSlug;
  const updateLabel = getUpdateLabel(versionStatus.update.status);
  const updateClass = getUpdateClass(versionStatus.update.status);
  const latestLabel = versionStatus.update.latest?.tagName ?? null;
  const statusTitle = latestLabel
    ? `${versionStatus.build.releaseTag} deployed. Latest release: ${latestLabel}.`
    : `${versionStatus.build.releaseTag} deployed. Update status: ${updateLabel}.`;

  const links = buildNavLinks(channelSlug);

  const navLinkClass = (active: boolean) =>
    `rounded-md px-2.5 py-1.5 text-sm font-semibold no-underline transition-[color,background] duration-[120ms] max-[768px]:px-3 max-[768px]:py-2.5 ${
      active ? 'bg-surface-hover text-accent' : 'text-muted hover:bg-surface-hover hover:text-text'
    }`;

  return (
    <nav
      className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-line bg-[rgba(35,37,43,0.96)] px-5 py-3 backdrop-blur-[12px]"
      aria-label="Main"
    >
      <div>
        <Link href="/" aria-label="GitcheGumi Alerts – Home">
          <Image src="/logo.svg" alt="GitcheGumi Alerts logo" width={320} height={80} priority />
        </Link>
      </div>

      <button
        type="button"
        className="hidden cursor-pointer flex-col gap-[5px] border-0 bg-transparent p-2 max-[768px]:flex"
        aria-label="Toggle menu"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((v) => !v)}
      >
        <span className="block h-0.5 w-6 rounded-[1px] bg-text" />
        <span className="block h-0.5 w-6 rounded-[1px] bg-text" />
        <span className="block h-0.5 w-6 rounded-[1px] bg-text" />
      </button>

      <div
        className={`flex flex-1 items-center justify-center gap-2 max-[768px]:absolute max-[768px]:inset-x-0 max-[768px]:top-full max-[768px]:flex-col max-[768px]:items-stretch max-[768px]:gap-1 max-[768px]:border-b max-[768px]:border-line max-[768px]:bg-[rgba(35,37,43,0.98)] max-[768px]:px-5 max-[768px]:py-3 ${
          mobileOpen ? '' : 'max-[768px]:hidden'
        }`}
      >
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className={navLinkClass(isActive(pathname, link.href, link.exact ?? false))}
            aria-current={isActive(pathname, link.href, link.exact ?? false) ? 'page' : undefined}
            onClick={() => setMobileOpen(false)}
          >
            {link.label}
          </Link>
        ))}
        {user.role === 'admin' && (
          <>
            <Link
              href="/dashboard/admin/workspaces"
              className={navLinkClass(pathname?.startsWith('/dashboard/admin/workspaces') ?? false)}
              aria-current={
                pathname?.startsWith('/dashboard/admin/workspaces') ? 'page' : undefined
              }
              onClick={() => setMobileOpen(false)}
            >
              Workspaces
            </Link>
            <Link
              href="/dashboard/admin/invites"
              className={navLinkClass(pathname?.startsWith('/dashboard/admin/invites') ?? false)}
              aria-current={pathname?.startsWith('/dashboard/admin/invites') ? 'page' : undefined}
              onClick={() => setMobileOpen(false)}
            >
              Invite Codes
            </Link>
          </>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1.5" title={statusTitle} aria-label={statusTitle}>
          <span className="font-mono text-xs text-muted">{versionStatus.build.releaseTag}</span>
          <span className={`pill ${updateClass}`}>{updateLabel}</span>
        </div>
        <span
          className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-muted max-[768px]:hidden"
          title={user.email}
        >
          {user.email}
        </span>
        <a
          className="rounded-md border border-line px-2 py-1 text-[13px] font-semibold text-muted no-underline hover:border-attention hover:bg-attention-soft hover:text-text"
          href="/api/auth/signout"
        >
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
