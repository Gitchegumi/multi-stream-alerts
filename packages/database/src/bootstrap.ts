import { randomBytes, randomUUID } from 'node:crypto';
import { prisma as realPrisma, toAlertEvent } from './client';
import { publishAlertEvent } from './redis';
import {
  ensureWorkspaceAlertDefaults as realEnsureWorkspaceAlertDefaults,
  resolveAlertConfig as realResolveAlertConfig,
} from './alert-catalog';
import type { AlertEvent, AlertPlatform, AlertType } from '@multi-stream-alerts/shared';

// Test injection hooks — only used in __tests__
let _resolveAlertConfig = realResolveAlertConfig;
let _ensureWorkspaceAlertDefaults = realEnsureWorkspaceAlertDefaults;
let _prisma = realPrisma;
export function __setResolveAlertConfig(fn: typeof realResolveAlertConfig | undefined) {
  _resolveAlertConfig = fn ?? realResolveAlertConfig;
}
export function __setEnsureWorkspaceAlertDefaults(
  fn: typeof realEnsureWorkspaceAlertDefaults | undefined,
) {
  _ensureWorkspaceAlertDefaults = fn ?? realEnsureWorkspaceAlertDefaults;
}
export function __setPrisma(mockPrisma: Partial<typeof realPrisma> | undefined) {
  _prisma = (mockPrisma ?? realPrisma) as typeof realPrisma;
}
export { realResolveAlertConfig as resolveAlertConfig };

export async function ensureDefaultChannel() {
  const slug = requiredEnv('DEFAULT_CHANNEL_SLUG');
  const name = requiredEnv('DEFAULT_CHANNEL_NAME');
  const displayKey = requiredEnv('INITIAL_DISPLAY_KEY');

  const channel = await _prisma.channel.upsert({
    where: { slug },
    update: { name },
    create: { slug, name },
  });

  for (const profile of [
    { slug: 'main', name: 'Main' },
    { slug: 'vertical', name: 'Vertical' },
    { slug: 'test', name: 'Test' },
  ]) {
    const existingProfile = await _prisma.overlayProfile.findUnique({
      where: { channelId_slug: { channelId: channel.id, slug: profile.slug } },
    });

    if (existingProfile) {
      continue;
    }

    await createOverlayProfileWithUniqueKey({
      channelId: channel.id,
      slug: profile.slug,
      name: profile.name,
      preferredDisplayKey: profile.slug === 'main' ? displayKey : undefined,
    });
  }

  await _ensureWorkspaceAlertDefaults(channel.id);

  return channel;
}

async function createOverlayProfileWithUniqueKey(input: {
  channelId: string;
  slug: string;
  name: string;
  preferredDisplayKey?: string;
}) {
  let preferredDisplayKey = input.preferredDisplayKey;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const displayKey = await resolveUniqueOverlayDisplayKey(preferredDisplayKey);

    try {
      return await _prisma.overlayProfile.create({
        data: {
          channelId: input.channelId,
          slug: input.slug,
          name: input.name,
          displayKey,
          settingsJson: {},
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const existingProfile = await _prisma.overlayProfile.findUnique({
        where: { channelId_slug: { channelId: input.channelId, slug: input.slug } },
      });
      if (existingProfile) {
        return existingProfile;
      }

      preferredDisplayKey = undefined;
    }
  }

  throw new Error(`Could not create overlay profile "${input.slug}" with a unique display key`);
}

async function resolveUniqueOverlayDisplayKey(preferredDisplayKey?: string) {
  if (preferredDisplayKey) {
    const existing = await _prisma.overlayProfile.findUnique({
      where: { displayKey: preferredDisplayKey },
      select: { id: true },
    });
    if (!existing) {
      return preferredDisplayKey;
    }
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = randomBytes(32).toString('hex');
    const existing = await _prisma.overlayProfile.findUnique({
      where: { displayKey: candidate },
      select: { id: true },
    });
    if (!existing) {
      return candidate;
    }
  }

  throw new Error('Could not generate a unique overlay display key');
}

export async function createStoredAlertEvent(input: {
  channelId: string;
  platform: AlertPlatform;
  type: AlertType;
  eventKey?: string;
  displayName: string;
  platformAccountId?: string;
  amount?: number;
  currency?: string;
  message?: string;
  isPublic?: boolean;
  tier?: string;
  quantity?: number;
  rawEventId: string;
  rawPayload?: unknown;
  layoutIdOverride?: string;
}): Promise<AlertEvent | null> {
  const config = await _resolveAlertConfig({
    channelId: input.channelId,
    platform: input.platform,
    type: input.type,
    eventKey: input.eventKey,
  });

  if (!config) {
    console.info('alert suppressed', {
      channelId: input.channelId,
      platform: input.platform,
      type: input.type,
      reason: 'no_config_or_disabled',
    });
    return null;
  }

  // Account targeting: when the config has selectedLinkedAccountIds in
  // configJson, the incoming event's platformAccountId must match one of
  // the selected linked accounts' platformAccountId. An empty or missing
  // selection means the alert will NOT fire — users must explicitly choose
  // which accounts the alert listens to.
  const configJson = (config.configJson ?? {}) as Record<string, unknown>;
  const selectedLinkedAccountIds = Array.isArray(configJson.selectedLinkedAccountIds)
    ? (configJson.selectedLinkedAccountIds as string[])
    : [];

  if (selectedLinkedAccountIds.length === 0) {
    console.info('alert suppressed by account targeting', {
      channelId: input.channelId,
      platform: input.platform,
      type: input.type,
      eventKey: input.eventKey,
      reason: 'no_accounts_selected',
    });
    return null;
  }

  if (!input.platformAccountId) {
    console.info('alert suppressed by account targeting', {
      channelId: input.channelId,
      platform: input.platform,
      type: input.type,
      eventKey: input.eventKey,
      reason: 'missing_platform_account_id',
    });
    return null;
  }

  const selectedAccounts = await _prisma.linkedAccount.findMany({
    where: {
      id: { in: selectedLinkedAccountIds },
      channelId: input.channelId,
      platform:
        input.platform === 'twitch'
          ? 'twitch'
          : input.platform === 'youtube'
            ? 'youtube'
            : undefined,
      isActive: true,
    },
    select: { platformAccountId: true },
  });

  if (!selectedAccounts.some((account) => account.platformAccountId === input.platformAccountId)) {
    console.info('alert suppressed by account targeting', {
      channelId: input.channelId,
      platform: input.platform,
      type: input.type,
      eventKey: input.eventKey,
      reason: 'account_not_selected',
      platformAccountId: input.platformAccountId,
    });
    return null;
  }

  const layout =
    input.layoutIdOverride !== undefined
      ? await _prisma.workspaceAlertLayout.findFirst({
          where: { id: input.layoutIdOverride, channelId: input.channelId },
        })
      : config.layout;
  const eventType = config.alertEventType;
  const row = await _prisma.alertEvent.create({
    data: {
      id: randomUUID(),
      channelId: input.channelId,
      platform: input.platform,
      type: input.type,
      eventKey: eventType.eventKey,
      layoutId: layout?.id,
      layoutName: layout?.name,
      layoutStyle: layout?.style,
      durationMs:
        input.layoutIdOverride !== undefined
          ? layout?.defaultDurationMs
          : (config.durationMs ?? layout?.defaultDurationMs),
      volume:
        input.layoutIdOverride !== undefined
          ? layout?.defaultVolume
          : (config.volume ?? layout?.defaultVolume),
      templateText: input.layoutIdOverride !== undefined ? undefined : config.templateText,
      visualAssetUrl: layout?.visualAssetId
        ? `/api/assets/${layout.visualAssetId}/content`
        : layout?.visualAssetUrl,
      soundAssetUrl: layout?.soundAssetId
        ? `/api/assets/${layout.soundAssetId}/content`
        : layout?.soundAssetUrl,
      displayName: input.displayName,
      amount: input.amount,
      currency: input.currency,
      message: input.isPublic === false ? undefined : input.message,
      isPublic: input.isPublic,
      tier: input.tier,
      quantity: input.quantity,
      rawEventId: input.rawEventId,
      rawPayloadJson:
        input.rawPayload === undefined ? undefined : JSON.parse(JSON.stringify(input.rawPayload)),
    },
  });

  console.info('alert fired', {
    channelId: input.channelId,
    eventId: row.id,
    platform: input.platform,
    type: input.type,
    eventKey: eventType.eventKey,
    layoutId: layout?.id,
  });

  return toAlertEvent(row);
}

export async function storeAndPublishAlertEvent(
  input: Parameters<typeof createStoredAlertEvent>[0],
): Promise<AlertEvent | null> {
  const event = await createStoredAlertEvent(input);
  if (!event) {
    return null;
  }
  await publishAlertEvent(event);
  return event;
}

export async function claimDeduplicationKey(input: {
  provider: string;
  rawEventId: string;
  channelId: string;
}) {
  try {
    await _prisma.deduplicationKey.create({ data: input });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return false;
    }

    throw error;
  }
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002',
  );
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
