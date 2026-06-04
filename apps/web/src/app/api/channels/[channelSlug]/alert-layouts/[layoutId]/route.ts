import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import {
  assertLayoutCanBeDeleted,
  canManageChannel,
  ensureDefaultChannel,
  getDefaultWorkspaceAlertLayout,
  prisma,
  type Prisma,
} from '@multi-stream-alerts/database';
import { safeAssetUrlSchema } from '@multi-stream-alerts/shared';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const nullableAssetUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  safeAssetUrlSchema.nullable().optional(),
);

const layoutSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  style: z.enum(['vertical', 'horizontal', 'compact', 'custom']).optional(),
  visualAssetUrl: nullableAssetUrlSchema,
  soundAssetUrl: nullableAssetUrlSchema,
  visualAssetId: z.string().min(1).nullable().optional(),
  soundAssetId: z.string().min(1).nullable().optional(),
  animationSettings: z.record(z.string(), z.unknown()).optional(),
  defaultDurationMs: z.number().int().min(500).max(60000).optional(),
  defaultVolume: z.number().int().min(0).max(100).optional(),
});

async function authorize(
  channelSlug: string,
  session: { user: { id: string; role: Parameters<typeof canManageChannel>[1] } },
) {
  await ensureDefaultChannel();
  const channel = await prisma.channel.findUnique({ where: { slug: channelSlug } });
  if (!channel) return { status: 404 as const, error: 'Channel not found' };

  const allowed = await canManageChannel(session.user.id, session.user.role, channel.id);
  if (!allowed) return { status: 403 as const, error: 'Channel access denied' };

  return { channel };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ channelSlug: string; layoutId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { channelSlug, layoutId } = await params;
  const auth = await authorize(channelSlug, session);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const existing = await prisma.workspaceAlertLayout.findFirst({
    where: { id: layoutId, channelId: auth.channel.id },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Layout not found' }, { status: 404 });
  }

  const parsed = layoutSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid layout payload' }, { status: 400 });
  }
  const assetError = await validateLayoutAssets(auth.channel.id, parsed.data);
  if (assetError) {
    return NextResponse.json({ error: assetError }, { status: 400 });
  }

  const data: Prisma.WorkspaceAlertLayoutUncheckedUpdateInput = {
    ...parsed.data,
    animationSettings: parsed.data.animationSettings as Prisma.InputJsonValue | undefined,
    visualAssetUrl: parsed.data.visualAssetId ? null : parsed.data.visualAssetUrl,
    soundAssetUrl: parsed.data.soundAssetId ? null : parsed.data.soundAssetUrl,
  };

  const layout = await prisma.workspaceAlertLayout.update({
    where: { id: layoutId },
    data,
  });

  return NextResponse.json({ ok: true, layout });
}

async function validateLayoutAssets(
  channelId: string,
  data: { visualAssetId?: string | null; soundAssetId?: string | null },
) {
  if (data.visualAssetId) {
    const asset = await prisma.workspaceAsset.findFirst({
      where: { id: data.visualAssetId, channelId },
    });
    if (!asset || asset.assetType === 'audio') return 'Visual asset must be an image or video.';
  }

  if (data.soundAssetId) {
    const asset = await prisma.workspaceAsset.findFirst({
      where: { id: data.soundAssetId, channelId },
    });
    if (!asset || asset.assetType !== 'audio') return 'Sound asset must be audio.';
  }

  return null;
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ channelSlug: string; layoutId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { channelSlug, layoutId } = await params;
  const auth = await authorize(channelSlug, session);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const fallback = url.searchParams.get('fallback') === 'default';
  const layout = await prisma.workspaceAlertLayout.findFirst({
    where: { id: layoutId, channelId: auth.channel.id },
  });
  if (!layout) {
    return NextResponse.json({ error: 'Layout not found' }, { status: 404 });
  }

  if (!fallback) {
    try {
      await assertLayoutCanBeDeleted(auth.channel.id, layoutId);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Layout is in use' },
        { status: 409 },
      );
    }
    await prisma.workspaceAlertConfig.updateMany({
      where: { channelId: auth.channel.id, layoutId },
      data: { layoutId: null },
    });
  } else {
    const defaultLayout = await getDefaultWorkspaceAlertLayout(auth.channel.id, layoutId);
    await prisma.workspaceAlertConfig.updateMany({
      where: { channelId: auth.channel.id, layoutId },
      data: { layoutId: defaultLayout?.id ?? null },
    });
  }

  await prisma.workspaceAlertLayout.delete({ where: { id: layoutId } });
  return NextResponse.json({
    ok: true,
    fallbackLayoutId: fallback
      ? ((await getDefaultWorkspaceAlertLayout(auth.channel.id, layoutId))?.id ?? null)
      : null,
  });
}
