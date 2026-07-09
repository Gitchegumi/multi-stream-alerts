import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyYoutubeWebSubSignature } from '../youtube.js';

function sign(secret: string, body: Buffer, algo: 'sha1' | 'sha256' = 'sha1'): string {
  return `${algo}=${createHmac(algo, secret).update(body).digest('hex')}`;
}

test('verifyYoutubeWebSubSignature accepts a valid sha1 signature', () => {
  const secret = 'websub-secret';
  const body = Buffer.from('<feed>payload</feed>');
  const signature = sign(secret, body);
  assert.equal(verifyYoutubeWebSubSignature({ secret, signature, rawBody: body }), true);
});

test('verifyYoutubeWebSubSignature accepts a valid sha256 signature', () => {
  const secret = 'websub-secret';
  const body = Buffer.from('<feed>payload</feed>');
  const signature = sign(secret, body, 'sha256');
  assert.equal(verifyYoutubeWebSubSignature({ secret, signature, rawBody: body }), true);
});

test('verifyYoutubeWebSubSignature rejects a tampered body', () => {
  const secret = 'websub-secret';
  const signature = sign(secret, Buffer.from('original'));
  assert.equal(
    verifyYoutubeWebSubSignature({ secret, signature, rawBody: Buffer.from('tampered') }),
    false,
  );
});

test('verifyYoutubeWebSubSignature rejects a wrong secret', () => {
  const body = Buffer.from('payload');
  const signature = sign('right-secret', body);
  assert.equal(
    verifyYoutubeWebSubSignature({ secret: 'wrong-secret', signature, rawBody: body }),
    false,
  );
});

test('verifyYoutubeWebSubSignature rejects missing or malformed headers', () => {
  const body = Buffer.from('payload');
  assert.equal(
    verifyYoutubeWebSubSignature({ secret: 's', signature: undefined, rawBody: body }),
    false,
  );
  assert.equal(
    verifyYoutubeWebSubSignature({ secret: 's', signature: 'not-a-sig', rawBody: body }),
    false,
  );
  assert.equal(
    verifyYoutubeWebSubSignature({ secret: '', signature: sign('s', body), rawBody: body }),
    false,
  );
});
