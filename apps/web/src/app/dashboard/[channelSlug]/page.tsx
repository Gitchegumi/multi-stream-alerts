import { notFound, redirect } from 'next/navigation';
import {
  prisma,
  getWorkspaceAlertSetup,
  getWorkspaceStorageUsage,
  getWorkspaceStorageSettings,
  canViewChannel,
  toAlertEvent,
} from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ChannelDashboardPage({
  params,
}: {
  params: Promise<{ channelSlug: string }>;
}) {
  const session = await requireDashboardSession();
  const { channelSlug } = await params;

  const channel = await prisma.channel.findUnique({
    where: { slug: channelSlug },
    include: { overlayProfiles: true },
  });
  if (!channel) notFound();

  const canView = await canViewChannel(session.user.id, session.user.role, channel.id);
  if (!canView) redirect('/dashboard?error=forbidden');

  const [alertSetup, recentEvents, storageUsage, storageSettings] = await Promise.all([
    getWorkspaceAlertSetup(channel.id),
    prisma.alertEvent.findMany({
      where: { channelId: channel.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    getWorkspaceStorageUsage(channel.id),
    getWorkspaceStorageSettings(channel.id),
  ]);

  const activeAlertsCount = alertSetup.configs.filter((c) => c.enabled).length;

  const navCards = [
    {
      label: 'Alerts',
      href: `/dashboard/${encodeURIComponent(channel.slug)}/alerts`,
      description: 'Configure alert types and layouts',
    },
    {
      label: 'Assets',
      href: `/dashboard/${encodeURIComponent(channel.slug)}/assets`,
      description: 'Manage images, videos, and audio files',
    },
    {
      label: 'Integrations',
      href: `/dashboard/${encodeURIComponent(channel.slug)}/integrations`,
      description: 'Connect Twitch, YouTube, Ko-fi',
    },
    {
      label: 'Overlay',
      href: `/dashboard/${encodeURIComponent(channel.slug)}/overlay`,
      description: 'Copy overlay URLs for OBS',
    },
    {
      label: 'Settings',
      href: `/dashboard/${encodeURIComponent(channel.slug)}/settings`,
      description: 'Workspace name and danger zone',
    },
  ];

  return (
    <main className="dashboard-shell">
      <section className="grid">
        <div className="panel stat-card">
          <strong className="stat-value">{activeAlertsCount}</strong>
          <span className="muted">Active alerts</span>
        </div>
        <div className="panel stat-card">
          <strong className="stat-value">{recentEvents.length}</strong>
          <span className="muted">Recent events</span>
        </div>
        <div className="panel stat-card">
          <strong className="stat-value">{formatBytes(storageUsage.usedBytes.toString())}</strong>
          <span className="muted">Storage used</span>
        </div>
      </section>

      <section className="grid" style={{ marginTop: 16 }}>
        {navCards.map((card) => (
          <Link key={card.label} href={card.href} className="panel nav-card">
            <strong>{card.label}</strong>
            <span className="muted small">{card.description}</span>
          </Link>
        ))}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Recent alerts</h2>
        {recentEvents.length === 0 ? (
          <p className="muted">No alerts have been received yet.</p>
        ) : (
          recentEvents.map((row) => {
            const event = toAlertEvent(row);
            return (
              <div className="event-row" key={event.id}>
                <strong>
                  {event.platform} / {event.type} from {event.displayName}
                </strong>
                <span className="muted">{new Date(event.createdAt).toLocaleString()}</span>
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}

function formatBytes(value: string | number) {
  const bytes = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
