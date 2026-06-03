import { notFound, redirect } from 'next/navigation';
import {
  prisma,
  getWorkspaceStorageSettings,
  getWorkspaceStorageUsage,
  canViewChannel,
} from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';
import { AssetLibrary } from '@/components/AssetLibrary';

export const dynamic = 'force-dynamic';

export default async function AssetsPage({ params }: { params: Promise<{ channelSlug: string }> }) {
  const session = await requireDashboardSession();
  const { channelSlug } = await params;

  const channel = await prisma.channel.findUnique({ where: { slug: channelSlug } });
  if (!channel) notFound();

  const canView = await canViewChannel(session.user.id, session.user.role, channel.id);
  if (!canView) redirect('/dashboard?error=forbidden');

  const [assets, storageSettings, storageUsage] = await Promise.all([
    prisma.workspaceAsset.findMany({
      where: { channelId: channel.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { visualLayouts: true, soundLayouts: true } } },
    }),
    getWorkspaceStorageSettings(channel.id),
    getWorkspaceStorageUsage(channel.id),
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
      <section className="panel">
        <h2>Asset Library</h2>
        <AssetLibrary
          channelSlug={channel.slug}
          initialAssets={assetLibrary}
          initialStorageUsage={{
            usedBytes: storageUsage.usedBytes.toString(),
            quotaBytes: storageSettings.quotaBytes.toString(),
            maxFileSizeBytes: storageSettings.maxFileSizeBytes.toString(),
          }}
        />
      </section>
    </main>
  );
}
