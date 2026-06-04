import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

import { createStoredAlertEvent, __setResolveAlertConfig, __setPrisma } from '../bootstrap';

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
  const createMock = mock.fn(async (args: { data: Record<string, unknown> }) => ({
    id: 'event-1',
    ...args.data,
    rawPayloadJson: args.data.rawPayloadJson ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const prismaMock = {
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

  const prismaMock = {
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
