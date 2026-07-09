import test from 'node:test';
import assert from 'node:assert/strict';
import { runYoutubeWebSubRenewal, readRenewalConfig } from '../websub-renewal.js';

test('runYoutubeWebSubRenewal re-subscribes each due subscription', async () => {
  const provisioned: string[] = [];
  const summary = await runYoutubeWebSubRenewal(1000, {
    now: () => 0,
    findExpiring: async () => [
      { channelId: 'c1', channelSlug: 's1', youtubeChannelId: 'UC1' },
      { channelId: 'c2', channelSlug: 's2', youtubeChannelId: 'UC2' },
    ],
    provision: async (input) => {
      provisioned.push(input.channelId);
      return { ok: true, topic: 'topic' };
    },
  });

  assert.deepEqual(provisioned, ['c1', 'c2']);
  assert.equal(summary.renewed, 2);
  assert.equal(summary.failed, 0);
});

test('runYoutubeWebSubRenewal counts failures without throwing', async () => {
  const summary = await runYoutubeWebSubRenewal(1000, {
    now: () => 0,
    findExpiring: async () => [
      { channelId: 'ok', channelSlug: 's', youtubeChannelId: 'UC' },
      { channelId: 'bad', channelSlug: 's', youtubeChannelId: 'UC' },
      { channelId: 'throws', channelSlug: 's', youtubeChannelId: 'UC' },
    ],
    provision: async (input) => {
      if (input.channelId === 'throws') throw new Error('boom');
      return { ok: input.channelId === 'ok', topic: 'topic', reason: 'http_400' };
    },
  });

  assert.equal(summary.renewed, 1);
  assert.equal(summary.failed, 2);
});

test('runYoutubeWebSubRenewal passes the lead window and clock to the finder', async () => {
  let seenLead: number | undefined;
  let seenNow: number | undefined;
  await runYoutubeWebSubRenewal(5000, {
    now: () => 42,
    findExpiring: async (leadMs, now) => {
      seenLead = leadMs;
      seenNow = now?.();
      return [];
    },
    provision: async () => ({ ok: true, topic: 't' }),
  });
  assert.equal(seenLead, 5000);
  assert.equal(seenNow, 42);
});

test('readRenewalConfig honors env overrides and falls back on bad values', () => {
  const overridden = readRenewalConfig({
    YOUTUBE_WEBSUB_RENEWAL_INTERVAL_MS: '120000',
    YOUTUBE_WEBSUB_RENEWAL_LEAD_MS: '3600000',
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(overridden.intervalMs, 120000);
  assert.equal(overridden.leadMs, 3600000);

  const defaults = readRenewalConfig({
    YOUTUBE_WEBSUB_RENEWAL_INTERVAL_MS: 'not-a-number',
  } as unknown as NodeJS.ProcessEnv);
  assert.equal(defaults.intervalMs, 60 * 60 * 1000);
  assert.equal(defaults.leadMs, 24 * 60 * 60 * 1000);
});
