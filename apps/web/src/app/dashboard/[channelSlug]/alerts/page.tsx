import { notFound, redirect } from 'next/navigation';
import {
  prisma,
  getWorkspaceAlertSetup,
  canViewChannel,
  toAlertEvent,
} from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';
import { CanvasEditor } from '@/components/canvas-editor/CanvasEditor';
import { RecentAlertFeed } from '@/components/RecentAlertFeed';
import { LinkedAccountBanner } from '@/components/LinkedAccountBanner';
import { normalizeCanvasSettings } from '@/lib/canvas-schema';

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
    configJson: config.configJson as Record<string, unknown> | null,
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
  const recentEvents = await prisma.alertEvent.findMany({
    where: { channelId: channel.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  const assets = await prisma.workspaceAsset.findMany({
    where: { channelId: channel.id },
    orderBy: { createdAt: 'desc' },
  });

  // Fetch linked accounts scoped to this channel for account targeting
  const linkedAccounts = await prisma.linkedAccount.findMany({
    where: {
      userId: session.user.id,
      channelId: channel.id,
      isActive: true,
      platform: { in: ['twitch', 'youtube'] },
    },
    select: {
      id: true,
      platform: true,
      platformAccountId: true,
      platformAccountName: true,
      isActive: true,
      isPrimary: true,
    },
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
      <section className="panel" style={{ marginBottom: 16 }}>
        <LinkedAccountBanner
          callbackUrl={`/dashboard/${encodeURIComponent(channel.slug)}/alerts?connected=PLATFORM`}
          channelSlug={channel.slug}
          compact
          collapsible
        />
      </section>

      <CanvasEditor
        channelId={channel.id}
        channelSlug={channel.slug}
        initialCanvases={canvases}
        alertConfigs={alertConfigs}
        linkedAccounts={linkedAccounts.map((a) => ({
          id: a.id,
          platform: a.platform as 'twitch' | 'youtube',
          platformAccountId: a.platformAccountId,
          platformAccountName: a.platformAccountName,
          isActive: a.isActive,
          isPrimary: a.isPrimary,
        }))}
        assets={assets.map((asset) => ({
          id: asset.id,
          assetType: asset.assetType,
          originalFilename: asset.originalFilename,
          externalUrl: asset.externalUrl,
          previewUrl: asset.externalUrl ?? `/api/assets/${encodeURIComponent(asset.id)}/content`,
        }))}
      />

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Recent alerts</h2>
        <RecentAlertFeed events={recentEvents.map(toAlertEvent)} />
      </section>
    </main>
  );
}

function readCanvasSettings(value: unknown, fallbackEventKeys: string[]) {
  return normalizeCanvasSettings(value, fallbackEventKeys).settings;
}
