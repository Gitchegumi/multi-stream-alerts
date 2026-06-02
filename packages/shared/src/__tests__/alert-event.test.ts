import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeAssetUrl, overlayMessage, parseAlertEvent, type AlertEvent } from '../alert-event';

function makeEvent(overrides: Partial<AlertEvent> = {}): AlertEvent {
  return {
    id: 'event-1',
    channelId: 'channel-1',
    platform: 'twitch',
    type: 'follow',
    eventKey: 'twitch.followed',
    displayName: 'Viewer',
    rawEventId: 'raw-1',
    createdAt: new Date('2026-06-02T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

test('isSafeAssetUrl allows http, https, and root-relative asset URLs', () => {
  assert.equal(isSafeAssetUrl('https://cdn.example.com/alert.png'), true);
  assert.equal(isSafeAssetUrl('http://localhost:3000/sound.mp3'), true);
  assert.equal(isSafeAssetUrl('/assets/alert.png'), true);
});

test('isSafeAssetUrl rejects script, credentialed, protocol-relative, and relative URLs', () => {
  assert.equal(isSafeAssetUrl('javascript:alert(1)'), false);
  assert.equal(isSafeAssetUrl('https://user:pass@example.com/secret.mp3'), false);
  assert.equal(isSafeAssetUrl('//cdn.example.com/alert.png'), false);
  assert.equal(isSafeAssetUrl('assets/alert.png'), false);
});

test('parseAlertEvent rejects unsafe asset URLs in serialized alert payloads', () => {
  assert.throws(() =>
    parseAlertEvent(JSON.stringify(makeEvent({ visualAssetUrl: 'javascript:alert(1)' }))),
  );
});

test('overlayMessage escapes template literals and replacement values', () => {
  const message = overlayMessage(
    makeEvent({
      displayName: '<script>alert("name")</script>',
      message: '<img src=x onerror=alert(1)>',
      templateText: '<b>{{name}}</b> {{message}}',
    }),
  );

  assert.equal(
    message,
    '&lt;b&gt;&lt;script&gt;alert(&quot;name&quot;)&lt;/script&gt;&lt;/b&gt; &lt;img src=x onerror=alert(1)&gt;',
  );
});
