import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  canManageChannel,
  canViewChannel,
  ensureDefaultChannel,
  getWorkspaceStorageSettings,
  getWorkspaceStorageUsage,
  prisma,
} from '@multi-stream-alerts/database';
import { externalAssetUrlSchema } from '@multi-stream-alerts/shared';
import { authOptions } from '@/lib/auth';
import { getAssetStorage } from '@/lib/asset-storage';
import { guessExternalAssetType, validateUploadedAsset } from '@/lib/asset-validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channelSlug: string }> },
) {
  const auth = await authorize(await params, 'view');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [assets, settings, usage] = await Promise.all([
    prisma.workspaceAsset.findMany({
      where: { channelId: auth.channel.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { visualLayouts: true, soundLayouts: true } } },
    }),
    getWorkspaceStorageSettings(auth.channel.id),
    getWorkspaceStorageUsage(auth.channel.id),
  ]);

  return NextResponse.json({
    assets: assets.map((asset) => ({
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
    })),
    usage: {
      usedBytes: usage.usedBytes.toString(),
      quotaBytes: settings.quotaBytes.toString(),
      assetCount: usage.assetCount,
      maxFileSizeBytes: settings.maxFileSizeBytes.toString(),
    },
    settings: {
      serverUploadsEnabled: settings.serverUploadsEnabled,
      nonAdminServerUploadsEnabled: settings.nonAdminServerUploadsEnabled,
      externalUrlsEnabled: settings.externalUrlsEnabled,
      s3Enabled: settings.s3Enabled,
      allowedMimeTypes: settings.allowedMimeTypes,
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ channelSlug: string }> },
) {
  const auth = await authorize(await params, 'manage');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const formData = await request.formData();
  const mode = String(formData.get('mode') ?? 'upload');
  const settings = await getWorkspaceStorageSettings(auth.channel.id);

  if (mode === 'external_url') {
    if (!settings.externalUrlsEnabled) {
      return NextResponse.json({ error: 'External asset URLs are disabled.' }, { status: 403 });
    }

    const externalUrl = externalAssetUrlSchema.safeParse(String(formData.get('url') ?? ''));
    if (!externalUrl.success) {
      return NextResponse.json(
        { error: 'External asset URL must be http or https.' },
        { status: 400 },
      );
    }

    let validated;
    try {
      validated = guessExternalAssetType(externalUrl.data);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Unsupported external asset URL.' },
        { status: 400 },
      );
    }
    const asset = await prisma.workspaceAsset.create({
      data: {
        channelId: auth.channel.id,
        ownerUserId: auth.userId,
        sourceType: 'external_url',
        assetType: validated.assetType,
        externalUrl: externalUrl.data,
        mimeType: validated.mimeType,
        storageProvider: 'external_url',
      },
    });

    return NextResponse.json({ ok: true, asset });
  }

  if (!settings.serverUploadsEnabled) {
    return NextResponse.json({ error: 'Server-hosted uploads are disabled.' }, { status: 403 });
  }
  if (auth.userRole !== 'admin' && !settings.nonAdminServerUploadsEnabled) {
    return NextResponse.json({ error: 'Uploads are limited to admins.' }, { status: 403 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A file is required.' }, { status: 400 });
  }
  if (BigInt(file.size) > settings.maxFileSizeBytes) {
    return NextResponse.json(
      { error: 'File exceeds the workspace max file size.' },
      { status: 413 },
    );
  }

  const usage = await getWorkspaceStorageUsage(auth.channel.id);
  if (usage.usedBytes + BigInt(file.size) > settings.quotaBytes) {
    return NextResponse.json({ error: 'Workspace storage quota exceeded.' }, { status: 413 });
  }

  const body = Buffer.from(await file.arrayBuffer());
  let validated;
  try {
    validated = validateUploadedAsset({
      filename: file.name,
      declaredMimeType: file.type,
      body,
      allowedMimeTypes: settings.allowedMimeTypes,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid asset file.' },
      { status: 400 },
    );
  }
  const stored = await getAssetStorage().put({
    channelId: auth.channel.id,
    body,
    mimeType: validated.mimeType,
  });

  const asset = await prisma.workspaceAsset.create({
    data: {
      channelId: auth.channel.id,
      ownerUserId: auth.userId,
      sourceType: stored.provider,
      assetType: validated.assetType,
      originalFilename: sanitizeOriginalFilename(file.name),
      storedFilename: stored.storedFilename,
      storageKey: stored.key,
      mimeType: validated.mimeType,
      fileSizeBytes: BigInt(file.size),
      storageProvider: stored.provider,
    },
  });

  return NextResponse.json({ ok: true, asset });
}

async function authorize(params: { channelSlug: string }, access: 'view' | 'manage') {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { status: 401 as const, error: 'Authentication required' };
  }

  await ensureDefaultChannel();
  const channel = await prisma.channel.findUnique({ where: { slug: params.channelSlug } });
  if (!channel) return { status: 404 as const, error: 'Channel not found' };

  const allowed =
    access === 'manage'
      ? await canManageChannel(session.user.id, session.user.role, channel.id)
      : await canViewChannel(session.user.id, session.user.role, channel.id);
  if (!allowed) return { status: 403 as const, error: 'Channel access denied' };

  return { channel, userId: session.user.id, userRole: session.user.role };
}

function sanitizeOriginalFilename(filename: string) {
  return filename.replace(/[^\w.\- ]+/g, '_').slice(0, 160);
}
