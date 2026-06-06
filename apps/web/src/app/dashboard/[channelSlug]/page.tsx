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
import { getVersionStatus } from '@/lib/update-check';
import { RecentAlertFeed } from '@/components/RecentAlertFeed';
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

  const [alertSetup, recentEvents, storageUsage, storageSettings, versionStatus] =
    await Promise.all([
      getWorkspaceAlertSetup(channel.id),
      prisma.alertEvent.findMany({
        where: { channelId: channel.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      getWorkspaceStorageUsage(channel.id),
      getWorkspaceStorageSettings(channel.id),
      getVersionStatus(),
    ]);

  const activeAlertsCount = alertSetup.configs.filter((c) => c.enabled).length;
  const guideUrl =
    process.env.NEXT_PUBLIC_DOCS_URL ?? 'https://gitchegumi.github.io/multi-stream-alerts/';

  const navCards = [
    {
      label: 'Alerts',
      href: `/dashboard/${encodeURIComponent(channel.slug)}/alerts`,
      description: 'Manage canvases, browser-source URLs, and alert assignments',
    },
    {
      label: 'Assets',
      href: `/dashboard/${encodeURIComponent(channel.slug)}/assets`,
      description: 'Manage images, videos, and audio files',
    },
    {
      label: 'Settings',
      href: `/dashboard/${encodeURIComponent(channel.slug)}/settings`,
      description: 'Workspace settings and integrations',
    },
    {
      label: 'Guide',
      href: guideUrl,
      description: 'User and developer documentation',
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
        <RecentAlertFeed events={recentEvents.map(toAlertEvent)} />
      </section>

      <section className="panel version-panel" style={{ marginTop: 16 }}>
        <div className="version-panel-header">
          <div>
            <h2>Deployment</h2>
            <p className="muted small">Current release and container build metadata.</p>
          </div>
          {versionStatus.update.status === 'update-available' ? (
            <span className="pill pill-warn">Update available</span>
          ) : versionStatus.update.status === 'up-to-date' ? (
            <span className="pill pill-ok">Up to date</span>
          ) : versionStatus.update.status === 'disabled' ? (
            <span className="pill pill-muted">Update checks off</span>
          ) : (
            <span className="pill pill-muted">Update unknown</span>
          )}
        </div>

        <dl className="version-grid">
          <div>
            <dt>Project release</dt>
            <dd>{versionStatus.build.releaseTag}</dd>
          </div>
          <div>
            <dt>Commit</dt>
            <dd>{versionStatus.build.shortCommitSha ?? 'unknown'}</dd>
          </div>
          {Object.entries(versionStatus.build.serviceVersions).map(([service, version]) => (
            <div key={service}>
              <dt>{service} service</dt>
              <dd>{version}</dd>
            </div>
          ))}
        </dl>

        {versionStatus.update.latest ? (
          <p className="muted small">
            Latest release:{' '}
            <a href={versionStatus.update.latest.htmlUrl}>{versionStatus.update.latest.tagName}</a>
            {versionStatus.update.checkedAt
              ? ` checked ${new Date(versionStatus.update.checkedAt).toLocaleString()}`
              : ''}
          </p>
        ) : versionStatus.update.error ? (
          <p className="muted small">Latest release could not be checked.</p>
        ) : null}
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
