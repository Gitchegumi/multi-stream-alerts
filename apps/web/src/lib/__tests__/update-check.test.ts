import test from 'node:test';
import assert from 'node:assert/strict';
import { getUpdateStatus } from '../update-check.ts';

test('update checks can be disabled for offline deployments', async () => {
  const status = await getUpdateStatus('0.1.0', { UPDATE_CHECK_ENABLED: 'false' });

  assert.equal(status.enabled, false);
  assert.equal(status.status, 'disabled');
});

test('update check reports newer GitHub releases without authentication', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        tag_name: 'v0.2.0',
        html_url: 'https://github.com/Gitchegumi/multi-stream-alerts/releases/tag/v0.2.0',
        published_at: '2026-06-04T00:00:00Z',
      }),
      { status: 200 },
    )) as typeof fetch;

  try {
    const status = await getUpdateStatus(
      '0.1.0',
      { UPDATE_CHECK_ENABLED: 'true', UPDATE_CHECK_REPO: 'Gitchegumi/multi-stream-alerts' },
      Date.parse('2026-06-04T01:00:00Z'),
    );

    assert.equal(status.enabled, true);
    assert.equal(status.status, 'update-available');
    assert.equal(status.latest?.tagName, 'v0.2.0');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('forced update checks bypass the cached release status', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        tag_name: `v0.3.${calls}`,
        html_url: `https://github.com/Gitchegumi/multi-stream-alerts/releases/tag/v0.3.${calls}`,
        published_at: '2026-06-04T00:00:00Z',
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const env = {
      UPDATE_CHECK_ENABLED: 'true',
      UPDATE_CHECK_REPO: 'Gitchegumi/multi-stream-alerts',
    };
    const first = await getUpdateStatus('0.1.0', env, Date.parse('2026-06-04T02:00:00Z'), {
      force: true,
    });
    const second = await getUpdateStatus('0.1.0', env, Date.parse('2026-06-04T02:00:01Z'), {
      force: true,
    });

    assert.equal(calls, 2);
    assert.equal(first.latest?.tagName, 'v0.3.1');
    assert.equal(second.latest?.tagName, 'v0.3.2');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
