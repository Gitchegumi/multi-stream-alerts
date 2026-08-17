'use client';

import { usePathname } from 'next/navigation';
import type { getVersionStatus } from '@/lib/update-check';
import { NavBar } from './NavBar';
import { SiteFooter } from './SiteFooter';

type DashboardUser = {
  email: string;
  role: string;
} | null;

type DashboardVersionStatus = Awaited<ReturnType<typeof getVersionStatus>>;

export function DashboardShell({
  children,
  user,
  defaultChannelSlug,
  versionStatus,
}: {
  children: React.ReactNode;
  user: DashboardUser;
  defaultChannelSlug: string | null;
  versionStatus: DashboardVersionStatus;
}) {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith('/dashboard') ?? false;
  const isOverlay = pathname?.startsWith('/overlay/') ?? false;

  if (isOverlay) return children;

  return (
    <div className="flex min-h-screen flex-col">
      {isDashboard && user && (
        <NavBar user={user} defaultChannelSlug={defaultChannelSlug} versionStatus={versionStatus} />
      )}
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
