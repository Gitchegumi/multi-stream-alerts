import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAuthorizedChannels } from '@multi-stream-alerts/database';
import { DashboardShell } from '@/components/DashboardShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'GitcheGumi Alerts',
  description: 'Self-hosted stream alerts and overlays',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getServerSession(authOptions);
  let defaultChannelSlug: string | null = null;
  if (session?.user?.id) {
    const channels = await getAuthorizedChannels(session.user.id, session.user.role);
    defaultChannelSlug = channels[0]?.slug ?? null;
  }

  return (
    <html lang="en">
      <body>
        <DashboardShell
          user={session?.user ? { email: session.user.email ?? '', role: session.user.role } : null}
          defaultChannelSlug={defaultChannelSlug}
        >
          {children}
        </DashboardShell>
      </body>
    </html>
  );
}
