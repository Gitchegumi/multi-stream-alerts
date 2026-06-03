'use client';

import { usePathname } from 'next/navigation';
import { NavBar } from './NavBar';

type DashboardUser = {
  email: string;
  role: string;
} | null;

export function DashboardShell({
  children,
  user,
  defaultChannelSlug,
}: {
  children: React.ReactNode;
  user: DashboardUser;
  defaultChannelSlug: string | null;
}) {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith('/dashboard') ?? false;

  return (
    <>
      {isDashboard && user && <NavBar user={user} defaultChannelSlug={defaultChannelSlug} />}
      {children}
    </>
  );
}
