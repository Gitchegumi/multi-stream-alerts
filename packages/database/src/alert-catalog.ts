import type { AlertPlatform, AlertType } from '@prisma/client';
import { prisma } from './client';

export const defaultAlertEventTypes = [
  ['youtube', 'youtube.tipped', 'YouTube Tipped', 'tip'],
  ['youtube', 'youtube.superchat', 'YouTube Sent Superchat', 'superchat'],
  ['youtube', 'youtube.subscribed', 'YouTube Subscribed', 'subscription'],
  ['youtube', 'youtube.member', 'YouTube Became Member', 'membership'],
  ['youtube', 'youtube.merch_purchased', 'YouTube Merch Purchased', 'shop_order'],
  ['youtube', 'youtube.widget_event', 'YouTube Widget Event (SDK/API)', 'widget_event'],
  ['twitch', 'twitch.followed', 'Twitch Followed', 'follow'],
  ['twitch', 'twitch.subscribed', 'Twitch Subscribed', 'subscription'],
  ['twitch', 'twitch.single_sub_gift', 'Twitch Single Sub Gift', 'gift'],
  ['twitch', 'twitch.community_gift', 'Twitch Community Gift', 'gift'],
  ['twitch', 'twitch.cheered', 'Twitch Cheered', 'cheer'],
  ['twitch', 'twitch.tipped', 'Twitch Tipped', 'tip'],
  ['twitch', 'twitch.raided', 'Twitch Raided', 'raid'],
  ['twitch', 'twitch.external_purchase', 'Twitch External Purchase (API)', 'external_purchase'],
  ['twitch', 'twitch.community_gifted_sub', 'Twitch Community Gifted Sub', 'gift'],
  ['twitch', 'twitch.hypechat', 'Twitch Hypechat', 'hypechat'],
  ['twitch', 'twitch.charity_donation', 'Twitch Charity Donation', 'charity_donation'],
  ['twitch', 'twitch.merch_purchased', 'Twitch Merch Purchased', 'shop_order'],
  ['twitch', 'twitch.redemption', 'Twitch Redemption', 'redemption'],
  ['twitch', 'twitch.widget_event', 'Twitch Widget Event (SDK/API)', 'widget_event'],
  ['kofi', 'kofi.tipped', 'Ko-fi Tipped', 'tip'],
  ['kofi', 'kofi.subscribed', 'Ko-fi Subscribed', 'subscription'],
  ['kofi', 'kofi.commission', 'Ko-fi Commission', 'commission'],
  ['kofi', 'kofi.shop_order', 'Ko-fi Shop Order', 'shop_order'],
  ['generic', 'generic.widget_event', 'Generic Widget Event (SDK/API)', 'widget_event'],
  ['manual', 'manual.test', 'Manual Test Alert', 'test'],
] satisfies Array<[AlertPlatform, string, string, AlertType]>;

export const defaultLayouts = [
  { name: 'Vertical', style: 'vertical', defaultDurationMs: 6500, defaultVolume: 80 },
  { name: 'Horizontal', style: 'horizontal', defaultDurationMs: 6500, defaultVolume: 80 },
  { name: 'Minimal', style: 'compact', defaultDurationMs: 4500, defaultVolume: 70 },
] as const;

let catalogSeedPromise: Promise<void> | null = null;
const seededWorkspaceIds = new Set<string>();

export async function ensureAlertEventCatalog() {
  if (catalogSeedPromise) {
    return catalogSeedPromise;
  }

  catalogSeedPromise = seedAlertEventCatalog();
  return catalogSeedPromise;
}

async function seedAlertEventCatalog() {
  let sortOrder = 10;
  for (const [platform, eventKey, displayName, legacyType] of defaultAlertEventTypes) {
    await prisma.alertEventType.upsert({
      where: { eventKey },
      update: { platform, displayName, legacyType, sortOrder, isActive: true },
      create: { platform, eventKey, displayName, legacyType, sortOrder, isActive: true },
    });
    sortOrder += 10;
  }
}

export async function ensureWorkspaceAlertDefaults(channelId: string) {
  if (seededWorkspaceIds.has(channelId)) {
    return;
  }

  await ensureAlertEventCatalog();

  for (const layout of defaultLayouts) {
    await prisma.workspaceAlertLayout.upsert({
      where: { channelId_name: { channelId, name: layout.name } },
      update: {},
      create: { ...layout, channelId, isSystemPreset: true },
    });
  }

  const defaultLayout = await getDefaultWorkspaceAlertLayout(channelId);
  const eventTypes = await prisma.alertEventType.findMany({ where: { isActive: true } });

  for (const eventType of eventTypes) {
    await prisma.workspaceAlertConfig.upsert({
      where: {
        channelId_alertEventTypeId: {
          channelId,
          alertEventTypeId: eventType.id,
        },
      },
      update: {},
      create: {
        channelId,
        alertEventTypeId: eventType.id,
        enabled: ['kofi.tipped', 'manual.test', 'generic.widget_event'].includes(
          eventType.eventKey,
        ),
        layoutId: defaultLayout?.id,
      },
    });
  }

  seededWorkspaceIds.add(channelId);
}

export async function getWorkspaceAlertSetup(channelId: string) {
  await ensureWorkspaceAlertDefaults(channelId);

  const [configs, layouts] = await Promise.all([
    prisma.workspaceAlertConfig.findMany({
      where: { channelId },
      include: { alertEventType: true, layout: true },
      orderBy: [{ alertEventType: { platform: 'asc' } }, { alertEventType: { sortOrder: 'asc' } }],
    }),
    prisma.workspaceAlertLayout.findMany({
      where: { channelId },
      orderBy: [{ isSystemPreset: 'desc' }, { createdAt: 'asc' }],
    }),
  ]);

  return { configs, layouts };
}

export async function resolveAlertConfig(input: {
  channelId: string;
  platform: AlertPlatform;
  type: AlertType;
  eventKey?: string;
}) {
  const eventKey = input.eventKey ?? legacyEventKey(input.platform, input.type);
  const exact = eventKey ? await findEnabledConfig(input.channelId, eventKey) : null;

  if (exact) {
    return exact;
  }

  if (eventKey) {
    console.info('alert event suppressed or unmapped', {
      channelId: input.channelId,
      eventKey,
      reason: 'disabled_or_unmapped',
    });
  }

  const fallback = await findEnabledConfig(input.channelId, `${input.platform}.widget_event`);
  if (fallback) {
    return fallback;
  }

  if (input.platform !== 'generic') {
    return findEnabledConfig(input.channelId, 'generic.widget_event');
  }

  return null;
}

export async function assertLayoutCanBeDeleted(channelId: string, layoutId: string) {
  const useCount = await prisma.workspaceAlertConfig.count({
    where: { channelId, layoutId },
  });
  if (useCount > 0) {
    throw new Error('This layout is assigned to alerts. Reassign them before deleting it.');
  }
}

export async function getDefaultWorkspaceAlertLayout(channelId: string, excludeLayoutId?: string) {
  const idFilter = excludeLayoutId ? { not: excludeLayoutId } : undefined;

  const verticalPreset = await prisma.workspaceAlertLayout.findFirst({
    where: { channelId, isSystemPreset: true, style: 'vertical', id: idFilter },
    orderBy: { createdAt: 'asc' },
  });
  if (verticalPreset) {
    return verticalPreset;
  }

  const systemPreset = await prisma.workspaceAlertLayout.findFirst({
    where: { channelId, isSystemPreset: true, id: idFilter },
    orderBy: { createdAt: 'asc' },
  });
  if (systemPreset) {
    return systemPreset;
  }

  return prisma.workspaceAlertLayout.findFirst({
    where: { channelId, id: idFilter },
    orderBy: { createdAt: 'asc' },
  });
}

function findEnabledConfig(channelId: string, eventKey: string) {
  return prisma.workspaceAlertConfig.findFirst({
    where: { channelId, enabled: true, alertEventType: { eventKey } },
    include: { alertEventType: true, layout: true },
  });
}

function legacyEventKey(platform: AlertPlatform, type: AlertType) {
  const keyByPlatformType: Partial<Record<AlertPlatform, Partial<Record<AlertType, string>>>> = {
    kofi: {
      tip: 'kofi.tipped',
      subscription: 'kofi.subscribed',
      commission: 'kofi.commission',
      shop_order: 'kofi.shop_order',
    },
    manual: { test: 'manual.test' },
    twitch: {
      follow: 'twitch.followed',
      subscription: 'twitch.subscribed',
      cheer: 'twitch.cheered',
      tip: 'twitch.tipped',
      raid: 'twitch.raided',
      gift: 'twitch.single_sub_gift',
      channel_point: 'twitch.redemption',
    },
    youtube: {
      tip: 'youtube.tipped',
      superchat: 'youtube.superchat',
      subscription: 'youtube.subscribed',
      membership: 'youtube.member',
      shop_order: 'youtube.merch_purchased',
    },
  };

  return keyByPlatformType[platform]?.[type];
}
