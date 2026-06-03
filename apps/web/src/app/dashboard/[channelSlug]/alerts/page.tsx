import { notFound, redirect } from 'next/navigation';
import {
  prisma,
  getWorkspaceAlertSetup,
  canViewChannel,
  toAlertEvent,
} from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';
import { AlertCatalogManager } from '@/components/AlertCatalogManager';

export const dynamic = 'force-dynamic';

export default async function AlertsPage({ params }: { params: Promise<{ channelSlug: string }> }) {
  const session = await requireDashboardSession();
  const { channelSlug } = await params;

  const channel = await prisma.channel.findUnique({ where: { slug: channelSlug } });
  if (!channel) notFound();

  const canView = await canViewChannel(session.user.id, session.user.role, channel.id);
  if (!canView) redirect('/dashboard?error=forbidden');

  const alertSetup = await getWorkspaceAlertSetup(channel.id);
  const alertConfigs = alertSetup.configs.map((config) => ({
    id: config.id,
    enabled: config.enabled,
    layoutId: config.layoutId,
    displayName: config.displayName,
    templateText: config.templateText,
    durationMs: config.durationMs,
    volume: config.volume,
    alertEventType: {
      platform: config.alertEventType.platform,
      eventKey: config.alertEventType.eventKey,
      displayName: config.alertEventType.displayName,
    },
  }));
  const alertLayouts = alertSetup.layouts.map((layout) => ({
    id: layout.id,
    name: layout.name,
    style: layout.style,
    visualAssetUrl: layout.visualAssetUrl,
    soundAssetUrl: layout.soundAssetUrl,
    visualAssetId: layout.visualAssetId,
    soundAssetId: layout.soundAssetId,
    defaultDurationMs: layout.defaultDurationMs,
    defaultVolume: layout.defaultVolume,
    isSystemPreset: layout.isSystemPreset,
  }));

  const recentEvents = await prisma.alertEvent.findMany({
    where: { channelId: channel.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const assets = await prisma.workspaceAsset.findMany({
    where: { channelId: channel.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      assetType: true,
      originalFilename: true,
      externalUrl: true,
    },
  });

  return (
    <main className="dashboard-shell">
      <AlertCatalogManager
        channelId={channel.id}
        channelSlug={channel.slug}
        initialConfigs={alertConfigs}
        initialLayouts={alertLayouts}
        initialAssets={assets}
      />

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
