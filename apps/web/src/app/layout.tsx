import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getVersionStatus } from '@/lib/update-check';
import { getAuthorizedChannels } from '@multi-stream-alerts/database';
import { DashboardShell } from '@/components/DashboardShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'GitcheGumi Alerts',
  description: 'Self-hosted stream alerts and overlays',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: [{ url: '/favicon.ico', type: 'image/x-icon' }],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [session, versionStatus] = await Promise.all([getServerSession(authOptions), getVersionStatus()]);
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
          versionStatus={versionStatus}
        >
          {children}
        </DashboardShell>
      </body>
    </html>
  );
}
