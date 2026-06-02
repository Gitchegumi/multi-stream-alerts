import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { assertLayoutCanBeDeleted, getDefaultWorkspaceAlertLayout } from '../alert-catalog';

test('assertLayoutCanBeDeleted blocks when any config references the layout', async () => {
  const { prisma } = await import('../client.ts');
  const original = prisma.workspaceAlertConfig.count;
  const count = mock.fn(async () => 1);
  (prisma.workspaceAlertConfig as unknown as { count: unknown }).count = count;

  try {
    await assert.rejects(
      () => assertLayoutCanBeDeleted('channel-1', 'layout-1'),
      /assigned to alerts/i,
    );
    const calls = count.mock.calls as unknown as Array<{ arguments: unknown[] }>;
    assert.deepEqual(calls[0]?.arguments[0], {
      where: { channelId: 'channel-1', layoutId: 'layout-1' },
    });
  } finally {
    (prisma.workspaceAlertConfig as unknown as { count: unknown }).count = original;
  }
});

test('assertLayoutCanBeDeleted allows an unreferenced layout', async () => {
  const { prisma } = await import('../client.ts');
  const original = prisma.workspaceAlertConfig.count;
  const count = mock.fn(async () => 0);
  (prisma.workspaceAlertConfig as unknown as { count: unknown }).count = count;

  try {
    await assert.doesNotReject(() => assertLayoutCanBeDeleted('channel-1', 'layout-1'));
  } finally {
    (prisma.workspaceAlertConfig as unknown as { count: unknown }).count = original;
  }
});

test('getDefaultWorkspaceAlertLayout prefers a vertical system preset without name lookup', async () => {
  const { prisma } = await import('../client.ts');
  const original = prisma.workspaceAlertLayout.findFirst;
  const verticalPreset = {
    id: 'layout-vertical',
    channelId: 'channel-1',
    name: 'Renamed Default',
    style: 'vertical',
    visualAssetUrl: null,
    soundAssetUrl: null,
    animationSettings: {},
    defaultDurationMs: 6500,
    defaultVolume: 80,
    isSystemPreset: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const findFirst = mock.fn(async () => verticalPreset);
  (prisma.workspaceAlertLayout as unknown as { findFirst: unknown }).findFirst = findFirst;

  try {
    const result = await getDefaultWorkspaceAlertLayout('channel-1', 'layout-deleted');
    assert.equal(result?.id, 'layout-vertical');
    const calls = findFirst.mock.calls as unknown as Array<{ arguments: unknown[] }>;
    assert.deepEqual(calls[0]?.arguments[0], {
      where: {
        channelId: 'channel-1',
        isSystemPreset: true,
        style: 'vertical',
        id: { not: 'layout-deleted' },
      },
      orderBy: { createdAt: 'asc' },
    });
  } finally {
    (prisma.workspaceAlertLayout as unknown as { findFirst: unknown }).findFirst = original;
  }
});
