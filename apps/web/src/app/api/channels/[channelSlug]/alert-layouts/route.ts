import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { canManageChannel, ensureDefaultChannel, prisma } from '@multi-stream-alerts/database';
import { safeAssetUrlSchema } from '@multi-stream-alerts/shared';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const nullableAssetUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  safeAssetUrlSchema.nullable().optional(),
);

const layoutSchema = z.object({
  name: z.string().min(1).max(80),
  style: z.enum(['vertical', 'horizontal', 'compact', 'custom']),
  visualAssetUrl: nullableAssetUrlSchema,
  soundAssetUrl: nullableAssetUrlSchema,
  visualAssetId: z.string().min(1).nullable().optional(),
  soundAssetId: z.string().min(1).nullable().optional(),
  defaultDurationMs: z.number().int().min(500).max(60000),
  defaultVolume: z.number().int().min(0).max(100),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ channelSlug: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  await ensureDefaultChannel();
  const { channelSlug } = await params;
  const channel = await prisma.channel.findUnique({ where: { slug: channelSlug } });
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const allowed = await canManageChannel(session.user.id, session.user.role, channel.id);
  if (!allowed) {
    return NextResponse.json({ error: 'Channel access denied' }, { status: 403 });
  }

  const parsed = layoutSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid layout payload' }, { status: 400 });
  }
  const assetError = await validateLayoutAssets(channel.id, parsed.data);
  if (assetError) {
    return NextResponse.json({ error: assetError }, { status: 400 });
  }

  const layout = await prisma.workspaceAlertLayout.create({
    data: {
      ...parsed.data,
      visualAssetUrl: parsed.data.visualAssetId ? null : parsed.data.visualAssetUrl,
      soundAssetUrl: parsed.data.soundAssetId ? null : parsed.data.soundAssetUrl,
      channelId: channel.id,
      isSystemPreset: false,
    },
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
