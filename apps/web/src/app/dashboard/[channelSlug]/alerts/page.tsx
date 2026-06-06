import { notFound, redirect } from 'next/navigation';
import {
  prisma,
  getWorkspaceAlertSetup,
  canViewChannel,
  toAlertEvent,
} from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';
import { CanvasWorkspace } from '@/components/CanvasWorkspace';
import { RecentAlertFeed } from '@/components/RecentAlertFeed';

export const dynamic = 'force-dynamic';

export default async function AlertsPage({ params }: { params: Promise<{ channelSlug: string }> }) {
  const session = await requireDashboardSession();
  const { channelSlug } = await params;

  const channel = await prisma.channel.findUnique({
    where: { slug: channelSlug },
    include: { overlayProfiles: { orderBy: { createdAt: 'asc' } } },
  });
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

  const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? 'https://<your-alerts-domain>';
  const enabledEventKeys = alertConfigs
    .filter((config) => config.enabled)
    .map((config) => config.alertEventType.eventKey);
  const canvases = channel.overlayProfiles.map((profile) => {
    const settings = readCanvasSettings(profile.settingsJson, enabledEventKeys);
    return {
      id: profile.id,
      name: profile.name,
      slug: profile.slug,
      displayKey: profile.displayKey,
      isActive: profile.isActive,
      updatedAt: profile.updatedAt.toISOString(),
      url: `${publicBaseUrl}/overlay/${channel.slug}/${profile.slug}?displayKey=${encodeURIComponent(
        profile.displayKey,
      )}`,
      settings,
    };
  });

  return (
    <main className="dashboard-shell">
      <CanvasWorkspace
        channelId={channel.id}
        channelSlug={channel.slug}
        initialCanvases={canvases}
        alertConfigs={alertConfigs}
        layouts={alertLayouts}
      />

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Recent alerts</h2>
        <RecentAlertFeed events={recentEvents.map(toAlertEvent)} />
      </section>
    </main>
  );
}

function readCanvasSettings(value: unknown, fallbackEventKeys: string[]) {
  const settings = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const raw = settings as {
    width?: unknown;
    height?: unknown;
    background?: unknown;
    alertEventKeys?: unknown;
  };
  const alertEventKeys = Array.isArray(raw.alertEventKeys)
    ? raw.alertEventKeys.filter((key): key is string => typeof key === 'string')
    : fallbackEventKeys;

  return {
    width: typeof raw.width === 'number' ? raw.width : 1920,
    height: typeof raw.height === 'number' ? raw.height : 1080,
    background: raw.background === 'dark' ? ('dark' as const) : ('transparent' as const),
    alertEventKeys,
  };
}
