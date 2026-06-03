import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  assertAssetCanBeDeleted,
  canManageChannel,
  ensureDefaultChannel,
  prisma,
} from '@multi-stream-alerts/database';
import { authOptions } from '@/lib/auth';
import { getAssetStorage } from '@/lib/asset-storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ channelSlug: string; assetId: string }> },
) {
  const auth = await authorize(await params);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';
  const asset = await prisma.workspaceAsset.findFirst({
    where: { id: auth.assetId, channelId: auth.channel.id },
  });
  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  if (!force) {
    try {
      await assertAssetCanBeDeleted(auth.channel.id, asset.id);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Asset is in use.' },
        { status: 409 },
      );
    }
  } else {
    await prisma.workspaceAlertLayout.updateMany({
      where: { channelId: auth.channel.id, visualAssetId: asset.id },
      data: { visualAssetId: null, visualAssetUrl: null },
    });
    await prisma.workspaceAlertLayout.updateMany({
      where: { channelId: auth.channel.id, soundAssetId: asset.id },
      data: { soundAssetId: null, soundAssetUrl: null },
    });
  }

  await prisma.workspaceAsset.delete({ where: { id: asset.id } });
  if (asset.storageKey && (asset.sourceType === 'local' || asset.sourceType === 's3')) {
    await getAssetStorage().delete(asset.storageKey);
  }

  return NextResponse.json({ ok: true });
}

async function authorize(params: { channelSlug: string; assetId: string }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { status: 401 as const, error: 'Authentication required' };
  }

  await ensureDefaultChannel();
  const channel = await prisma.channel.findUnique({ where: { slug: params.channelSlug } });
  if (!channel) return { status: 404 as const, error: 'Channel not found' };

  const allowed = await canManageChannel(session.user.id, session.user.role, channel.id);
  if (!allowed) return { status: 403 as const, error: 'Channel access denied' };

  return { channel, assetId: params.assetId };
}
