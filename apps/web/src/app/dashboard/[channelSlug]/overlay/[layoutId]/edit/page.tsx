import { notFound, redirect } from 'next/navigation';
import { canManageChannel, prisma } from '@multi-stream-alerts/database';
import { OverlayLayoutEditor } from '@/components/OverlayLayoutEditor';
import { requireDashboardSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function OverlayEditorPage({
  params,
}: {
  params: Promise<{ channelSlug: string; layoutId: string }>;
}) {
  const session = await requireDashboardSession();
  const { channelSlug, layoutId } = await params;

  const channel = await prisma.channel.findUnique({ where: { slug: channelSlug } });
  if (!channel) notFound();

  const canManage = await canManageChannel(session.user.id, session.user.role, channel.id);
  if (!canManage) redirect('/dashboard?error=forbidden');

  const [layout, assets] = await Promise.all([
    prisma.workspaceAlertLayout.findFirst({
      where: { id: layoutId, channelId: channel.id },
      select: {
        id: true,
        name: true,
        animationSettings: true,
      },
    }),
    prisma.workspaceAsset.findMany({
      where: { channelId: channel.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        assetType: true,
        originalFilename: true,
        externalUrl: true,
      },
    }),
  ]);

  if (!layout) notFound();

  return (
    <main className="overlay-editor-page">
      <OverlayLayoutEditor
        channelSlug={channel.slug}
        layout={{
          id: layout.id,
          name: layout.name,
          animationSettings: asSettingsObject(layout.animationSettings),
        }}
        assets={assets.map((asset) => ({
          id: asset.id,
          assetType: asset.assetType,
          originalFilename: asset.originalFilename,
          externalUrl: asset.externalUrl,
          previewUrl: asset.externalUrl ?? `/api/assets/${encodeURIComponent(asset.id)}/content`,
        }))}
        canManage={canManage}
      />
    </main>
  );
}

function asSettingsObject(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
