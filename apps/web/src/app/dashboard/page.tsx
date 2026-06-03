import {
  ensureDefaultChannel,
  getWorkspaceAlertSetup,
  getAuthorizedChannels,
  getWorkspaceStorageSettings,
  getWorkspaceStorageUsage,
  prisma,
  toAlertEvent,
} from '@multi-stream-alerts/database';
import { productName } from '@multi-stream-alerts/ui';
import { AlertCatalogManager } from '@/components/AlertCatalogManager';
import { ManualAlertForm } from '@/components/ManualAlertForm';
import { requireDashboardSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Map a `?error=...` hint from a server-side redirect to a user-readable
// notice. Unknown values get a generic message — the query param is a
// hint, not user input, so we never echo the raw value.
function errorNoticeFor(value: string | undefined): string | null {
  if (!value) return null;
  if (value === 'forbidden') return "You don't have access to that channel.";
  return 'Something went wrong.';
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireDashboardSession();
  await ensureDefaultChannel();
  const channels = await getAuthorizedChannels(session.user.id, session.user.role);
  const selectedChannel = channels[0];

  const { error: errorParam } = await searchParams;
  const errorNotice = errorNoticeFor(errorParam);

  if (!selectedChannel) {
    return (
      <main className="dashboard-shell">
        <h1 className="dashboard-title">{productName}</h1>
        {errorNotice ? (
          <p className="error" role="alert" style={{ marginTop: 12 }}>
            {errorNotice}
          </p>
        ) : null}
        <p className="muted">No channel access has been assigned for this account.</p>
      </main>
    );
  }

  const recentEvents = await prisma.alertEvent.findMany({
    where: { channelId: selectedChannel.id },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });

  const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? 'https://<your-alerts-domain>';
  const overlayUrls = selectedChannel.overlayProfiles.map((profile) => ({
    label: profile.name,
    url: `${publicBaseUrl}/overlay/${profile.slug}?displayKey=${encodeURIComponent(profile.displayKey)}`,
  }));
  const alertSetup = await getWorkspaceAlertSetup(selectedChannel.id);
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
  const [assets, storageSettings, storageUsage] = await Promise.all([
    prisma.workspaceAsset.findMany({
      where: { channelId: selectedChannel.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { visualLayouts: true, soundLayouts: true } } },
    }),
    getWorkspaceStorageSettings(selectedChannel.id),
    getWorkspaceStorageUsage(selectedChannel.id),
  ]);
  const assetLibrary = assets.map((asset) => ({
    id: asset.id,
    sourceType: asset.sourceType,
    assetType: asset.assetType,
    originalFilename: asset.originalFilename,
    externalUrl: asset.externalUrl,
    mimeType: asset.mimeType,
    fileSizeBytes: asset.fileSizeBytes?.toString() ?? null,
    storageProvider: asset.storageProvider,
    createdAt: asset.createdAt.toISOString(),
    usageCount: asset._count.visualLayouts + asset._count.soundLayouts,
    previewUrl: asset.externalUrl ?? `/api/assets/${encodeURIComponent(asset.id)}/content`,
  }));

  return (
    <main className="dashboard-shell">
      {errorNotice ? (
        <p className="error" role="alert" style={{ marginTop: 12 }}>
          {errorNotice}
        </p>
      ) : null}
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">{productName}</h1>
          <p className="muted">
            Signed in as {session.user.email}. Managing {selectedChannel.name}.
          </p>
        </div>
        <div className="stack" style={{ flexDirection: 'row', gap: 8 }}>
          <a
            className="button-secondary"
            href={`/dashboard/${encodeURIComponent(selectedChannel.slug)}/integrations`}
          >
            Settings → Integrations
          </a>
          <a className="button" href="/api/auth/signout">
            Sign out
          </a>
        </div>
      </header>

      <section className="grid">
        <div className="panel">
          <h2>Manual test alert</h2>
          <ManualAlertForm channelId={selectedChannel.id} />
        </div>

        <div className="panel">
          <h2>Overlay URLs</h2>
          <div className="url-list">
            {overlayUrls.map((overlay) => (
              <div key={overlay.label}>
                <strong>{overlay.label}</strong>
                <div className="url-item">{overlay.url}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <AlertCatalogManager
          channelId={selectedChannel.id}
          channelSlug={selectedChannel.slug}
          initialConfigs={alertConfigs}
          initialLayouts={alertLayouts}
          initialAssets={assetLibrary}
          initialStorageUsage={{
            usedBytes: storageUsage.usedBytes.toString(),
            quotaBytes: storageSettings.quotaBytes.toString(),
            maxFileSizeBytes: storageSettings.maxFileSizeBytes.toString(),
          }}
        />
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
