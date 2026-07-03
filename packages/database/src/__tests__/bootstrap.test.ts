import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

import {
  createStoredAlertEvent,
  ensureDefaultChannel,
  __setEnsureWorkspaceAlertDefaults,
  __setResolveAlertConfig,
  __setPrisma,
} from '../bootstrap';

test('ensureDefaultChannel avoids colliding overlay profile display keys', async () => {
  const previousDefaultSlug = process.env.DEFAULT_CHANNEL_SLUG;
  const previousDefaultName = process.env.DEFAULT_CHANNEL_NAME;
  const previousDisplayKey = process.env.INITIAL_DISPLAY_KEY;
  process.env.DEFAULT_CHANNEL_SLUG = 'default-channel';
  process.env.DEFAULT_CHANNEL_NAME = 'Default Channel';
  process.env.INITIAL_DISPLAY_KEY = 'colliding-display-key';

  const createMock = mock.fn(async (args: { data: Record<string, unknown> }) => ({
    id: `profile-${String(args.data.slug)}`,
    ...args.data,
  }));
  const findUniqueMock = mock.fn(async (args: { where: Record<string, unknown> }) => {
    if ('channelId_slug' in args.where) {
      return null;
    }
    if (args.where.displayKey === 'colliding-display-key') {
      return { id: 'existing-profile' };
    }
    return null;
  });
  const ensureDefaultsMock = mock.fn(async () => undefined);

  const prismaMock = {
    channel: {
      upsert: mock.fn(async () => ({ id: 'channel-1', slug: 'default-channel' })),
    },
    overlayProfile: {
      findUnique: findUniqueMock,
      create: createMock,
    },
  };

  __setPrisma(prismaMock as unknown as Parameters<typeof __setPrisma>[0]);
  __setEnsureWorkspaceAlertDefaults(
    ensureDefaultsMock as unknown as Parameters<typeof __setEnsureWorkspaceAlertDefaults>[0],
  );

  try {
    await ensureDefaultChannel();

    const createCalls = createMock.mock.calls as unknown as Array<{
      arguments: [{ data: Record<string, unknown> }];
    }>;
    assert.equal(createCalls.length, 3);

    const createdProfiles = createCalls.map((call) => call.arguments[0].data);
    const mainProfile = createdProfiles.find((profile) => profile.slug === 'main');
    assert.ok(mainProfile);
    assert.notEqual(mainProfile.displayKey, 'colliding-display-key');
    assert.equal(String(mainProfile.displayKey).length, 64);
  } finally {
    if (previousDefaultSlug === undefined) {
      delete process.env.DEFAULT_CHANNEL_SLUG;
    } else {
      process.env.DEFAULT_CHANNEL_SLUG = previousDefaultSlug;
    }
    if (previousDefaultName === undefined) {
      delete process.env.DEFAULT_CHANNEL_NAME;
    } else {
      process.env.DEFAULT_CHANNEL_NAME = previousDefaultName;
    }
    if (previousDisplayKey === undefined) {
      delete process.env.INITIAL_DISPLAY_KEY;
    } else {
      process.env.INITIAL_DISPLAY_KEY = previousDisplayKey;
    }
    __setEnsureWorkspaceAlertDefaults(undefined);
    __setPrisma(undefined);
  }
});

test('createStoredAlertEvent with layoutIdOverride uses layout defaults over config values', async () => {
  const resolveMock = mock.fn(async () => ({
    id: 'config-1',
    channelId: 'channel-1',
    alertEventTypeId: 'et-1',
    alertEventType: {
      id: 'et-1',
      platform: 'twitch' as const,
      eventKey: 'twitch.followed',
      displayName: 'Twitch Followed',
      description: null,
      legacyType: 'follow' as const,
      sortOrder: 10,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    enabled: true,
    layoutId: 'layout-config',
    layout: {
      id: 'layout-config',
      channelId: 'channel-1',
      name: 'Config Layout',
      style: 'vertical',
      visualAssetUrl: null,
      soundAssetUrl: null,
      animationSettings: {},
      defaultDurationMs: 5000,
      defaultVolume: 60,
      isSystemPreset: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    durationMs: 3000,
    volume: 40,
    templateText: 'Config template text',
    configJson: { selectedLinkedAccountIds: ['acc-1'] },
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const overrideLayout = {
    id: 'layout-override',
    channelId: 'channel-1',
    name: 'Override Layout',
    style: 'horizontal',
    visualAssetUrl: null,
    soundAssetUrl: null,
    animationSettings: {},
    defaultDurationMs: 7000,
    defaultVolume: 90,
    isSystemPreset: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const findFirstMock = mock.fn(async () => overrideLayout);
  const findManyMock = mock.fn(async () => [{ platformAccountId: 'platform-acc-1' }]);
  const createMock = mock.fn(async (args: { data: Record<string, unknown> }) => ({
    id: 'event-1',
    ...args.data,
    rawPayloadJson: args.data.rawPayloadJson ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const prismaMock = {
    linkedAccount: { findMany: findManyMock },
    workspaceAlertLayout: { findFirst: findFirstMock },
    alertEvent: { create: createMock },
  };

  __setResolveAlertConfig(resolveMock as unknown as Parameters<typeof __setResolveAlertConfig>[0]);
  __setPrisma(prismaMock as unknown as Parameters<typeof __setPrisma>[0]);

  try {
    const result = await createStoredAlertEvent({
      channelId: 'channel-1',
      platform: 'twitch' as const,
      type: 'follow',
      eventKey: 'twitch.followed',
      displayName: 'TestUser',
      rawEventId: 'raw-1',
      platformAccountId: 'platform-acc-1',
      layoutIdOverride: 'layout-override',
    });

    assert.ok(result, 'should return an event');
    assert.equal(result.durationMs, 7000, 'durationMs should use layout default, not config value');
    assert.equal(result.volume, 90, 'volume should use layout default, not config value');
    assert.equal(
      result.templateText,
      undefined,
      'templateText should be undefined when layoutIdOverride is set',
    );
    assert.equal(result.layoutId, 'layout-override');

    const createCalls = createMock.mock.calls as unknown as Array<{
      arguments: [{ data: Record<string, unknown> }];
    }>;
    const data = createCalls[0]?.arguments[0].data;
    assert.equal(data?.durationMs, 7000);
    assert.equal(data?.volume, 90);
    assert.equal(data?.templateText, undefined);
    assert.equal(data?.layoutId, 'layout-override');

    const findFirstCalls = findFirstMock.mock.calls as unknown as Array<{ arguments: unknown[] }>;
    assert.deepEqual(findFirstCalls[0]?.arguments[0], {
      where: { id: 'layout-override', channelId: 'channel-1' },
    });
  } finally {
    __setResolveAlertConfig(undefined);
    __setPrisma(undefined);
  }
});

test('createStoredAlertEvent without layoutIdOverride uses config values with layout fallback', async () => {
  const resolveMock = mock.fn(async () => ({
    id: 'config-1',
    channelId: 'channel-1',
    alertEventTypeId: 'et-1',
    alertEventType: {
      id: 'et-1',
      platform: 'twitch' as const,
      eventKey: 'twitch.followed',
      displayName: 'Twitch Followed',
      description: null,
      legacyType: 'follow' as const,
      sortOrder: 10,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    enabled: true,
    layoutId: 'layout-config',
    layout: {
      id: 'layout-config',
      channelId: 'channel-1',
      name: 'Config Layout',
      style: 'vertical',
      visualAssetUrl: null,
      soundAssetUrl: null,
      animationSettings: {},
      defaultDurationMs: 5000,
      defaultVolume: 60,
      isSystemPreset: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    durationMs: 3000,
    volume: 40,
    templateText: 'Config template text',
    configJson: { selectedLinkedAccountIds: ['acc-1'] },
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const createMock = mock.fn(async (args: { data: Record<string, unknown> }) => ({
    id: 'event-2',
    ...args.data,
    rawPayloadJson: args.data.rawPayloadJson ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  const findManyMock = mock.fn(async () => [{ platformAccountId: 'platform-acc-1' }]);

  const prismaMock = {
    linkedAccount: { findMany: findManyMock },
    alertEvent: { create: createMock },
  };

  __setResolveAlertConfig(resolveMock as unknown as Parameters<typeof __setResolveAlertConfig>[0]);
  __setPrisma(prismaMock as unknown as Parameters<typeof __setPrisma>[0]);

  try {
    const result = await createStoredAlertEvent({
      channelId: 'channel-1',
      platform: 'twitch' as const,
      type: 'follow',
      eventKey: 'twitch.followed',
      displayName: 'TestUser',
      rawEventId: 'raw-2',
      platformAccountId: 'platform-acc-1',
    });

    assert.ok(result);
    assert.equal(result.durationMs, 3000, 'durationMs should use config value');
    assert.equal(result.volume, 40, 'volume should use config value');
    assert.equal(
      result.templateText,
      'Config template text',
      'templateText should use config value',
    );
    assert.equal(result.layoutId, 'layout-config');

    const createCalls = createMock.mock.calls as unknown as Array<{
      arguments: [{ data: Record<string, unknown> }];
    }>;
    const data = createCalls[0]?.arguments[0].data;
    assert.equal(data?.durationMs, 3000);
    assert.equal(data?.volume, 40);
    assert.equal(data?.templateText, 'Config template text');
    assert.equal(data?.layoutId, 'layout-config');
  } finally {
    __setResolveAlertConfig(undefined);
    __setPrisma(undefined);
  }
});
