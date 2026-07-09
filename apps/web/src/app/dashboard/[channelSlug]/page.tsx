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
import { UserLocalTime } from '@/components/UserLocalTime';
import { cardGridClass, dashboardShellClass } from '@/components/layout-styles';
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
      getVersionStatus(process.env, { force: true }),
    ]);

  const activeAlertsCount = alertSetup.configs.filter((c) => c.enabled).length;
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
      description: 'Workspace settings',
    },
    {
      label: 'Guide',
      href: `/dashboard/${encodeURIComponent(channel.slug)}/guide`,
      description: 'User and developer documentation',
    },
  ];

  return (
    <main className={dashboardShellClass}>
      <section className={`${cardGridClass} mt-6`}>
        <div className={`panel ${statCardClass}`}>
          <strong className={statValueClass}>{activeAlertsCount}</strong>
          <span className="muted">Active alerts</span>
        </div>
        <div className={`panel ${statCardClass}`}>
          <strong className={statValueClass}>{recentEvents.length}</strong>
          <span className="muted">Recent events</span>
        </div>
        <div className={`panel ${statCardClass}`}>
          <strong className={statValueClass}>
            {formatBytes(storageUsage.usedBytes.toString())}
          </strong>
          <span className="muted">Storage used</span>
        </div>
      </section>

      <section className={`${cardGridClass} mt-4`}>
        {navCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="panel grid gap-2 no-underline transition-[border-color,transform,background] duration-[120ms] hover:-translate-y-px hover:border-accent hover:[background:linear-gradient(135deg,rgba(175,224,206,0.1),transparent_60%),var(--panel)]"
          >
            <strong>{card.label}</strong>
            <span className="muted small">{card.description}</span>
          </Link>
        ))}
      </section>

      <section className="panel mt-4">
        <h2>Recent alerts</h2>
        <RecentAlertFeed events={recentEvents.map(toAlertEvent)} />
      </section>

      <section className="panel mt-4 grid gap-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2>Deployment</h2>
            <p className="muted small m-0">Current release and container build metadata.</p>
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

        <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
          <div className={versionCellClass}>
            <dt className={versionTermClass}>Project release</dt>
            <dd className={versionValueClass}>{versionStatus.build.releaseTag}</dd>
          </div>
          <div className={versionCellClass}>
            <dt className={versionTermClass}>Commit</dt>
            <dd className={versionValueClass}>{versionStatus.build.shortCommitSha ?? 'unknown'}</dd>
          </div>
          {Object.entries(versionStatus.build.serviceVersions).map(([service, version]) => (
            <div key={service} className={versionCellClass}>
              <dt className={versionTermClass}>{service} service</dt>
              <dd className={versionValueClass}>{version}</dd>
            </div>
          ))}
        </dl>

        {versionStatus.update.latest ? (
          <p className="muted small">
            Latest release:{' '}
            <a href={versionStatus.update.latest.htmlUrl}>{versionStatus.update.latest.tagName}</a>
            {versionStatus.update.checkedAt ? (
              <>
                {' checked '}
                <UserLocalTime value={versionStatus.update.checkedAt} />
              </>
            ) : null}
          </p>
        ) : versionStatus.update.error ? (
          <p className="muted small">Latest release could not be checked.</p>
        ) : null}
      </section>
    </main>
  );
}

const statCardClass =
  'gap-1.5 border-[rgba(65,102,245,0.4)] [background:linear-gradient(135deg,rgba(65,102,245,0.16),transparent_68%),var(--panel)]';
const statValueClass = 'text-attention text-[32px] leading-none';
const versionCellClass = 'grid gap-1 rounded-md border border-line bg-surface-soft p-2.5';
const versionTermClass = 'text-muted text-xs uppercase';
const versionValueClass = 'm-0 [overflow-wrap:anywhere] font-mono text-[13px]';

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
