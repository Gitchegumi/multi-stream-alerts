import { prisma } from './client';

const defaultQuotaBytes = 512n * 1024n * 1024n;
const defaultMaxFileSizeBytes = 50n * 1024n * 1024n;

export async function getWorkspaceStorageSettings(channelId: string) {
  return prisma.workspaceStorageSettings.upsert({
    where: { channelId },
    update: {},
    create: {
      channelId,
      quotaBytes: BigInt(process.env.DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES ?? defaultQuotaBytes),
      maxFileSizeBytes: BigInt(process.env.MAX_UPLOAD_SIZE_BYTES ?? defaultMaxFileSizeBytes),
      s3Enabled: process.env.STORAGE_PROVIDER === 's3',
      serverUploadsEnabled: process.env.SERVER_UPLOADS_ENABLED !== 'false',
      nonAdminServerUploadsEnabled: process.env.NON_ADMIN_SERVER_UPLOADS_ENABLED !== 'false',
      externalUrlsEnabled: process.env.EXTERNAL_ASSET_URLS_ENABLED !== 'false',
      allowedMimeTypes:
        process.env.ALLOWED_ASSET_MIME_TYPES?.split(',')
          .map((item) => item.trim())
          .filter(Boolean) ?? [],
    },
  });
}

export async function getWorkspaceStorageUsage(channelId: string) {
  const aggregate = await prisma.workspaceAsset.aggregate({
    where: { channelId, sourceType: { in: ['local', 's3'] } },
    _sum: { fileSizeBytes: true },
    _count: true,
  });

  return {
    usedBytes: BigInt(aggregate._sum.fileSizeBytes ?? 0),
    assetCount: aggregate._count,
  };
}

export async function assertAssetCanBeDeleted(channelId: string, assetId: string) {
  const [visualUseCount, soundUseCount] = await Promise.all([
    prisma.workspaceAlertLayout.count({ where: { channelId, visualAssetId: assetId } }),
    prisma.workspaceAlertLayout.count({ where: { channelId, soundAssetId: assetId } }),
  ]);

  if (visualUseCount + soundUseCount > 0) {
    throw new Error('This asset is assigned to one or more layouts.');
  }
}
