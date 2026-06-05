'use client';

import { usePathname } from 'next/navigation';
import type { getVersionStatus } from '@/lib/update-check';
import { NavBar } from './NavBar';

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

  return (
    <>
      {isDashboard && user && (
        <NavBar user={user} defaultChannelSlug={defaultChannelSlug} versionStatus={versionStatus} />
      )}
      {children}
    </>
  );
}
