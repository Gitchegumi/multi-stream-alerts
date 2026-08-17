import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { metadata } from '../page.tsx';
import { APP_NAME } from '../../lib/app-identity.ts';

const source = await readFile(new URL('../page.tsx', import.meta.url), 'utf8');

test('homepage prominently identifies the OAuth application by its exact name', () => {
  assert.equal(APP_NAME, 'GitchAlerts');
  assert.equal(metadata.title, 'GitchAlerts | Self-hosted stream alerts and overlays');
  assert.match(source, /<h1[\s\S]*?\{APP_NAME\}[\s\S]*?<\/h1>/);
});

test('homepage explains the application purpose and Google data use while signed out', () => {
  assert.match(source, /\{APP_NAME\} gives creators one place/);
  assert.match(source, /grant read-only YouTube access/);
  assert.match(source, /does not upload, edit, or delete your YouTube videos or channel/);
  assert.match(source, /href="\/privacy"/);
});

test('homepage introduces the self-hosted philosophy with authentic editor screenshots', () => {
  assert.match(source, /Why self-hosted/);
  assert.match(source, /Because the stream is yours/);
  assert.match(source, /src="\/screenshots\/canvas-editor.png"/);
  assert.match(source, /src="\/screenshots\/canvas-assets.png"/);
});
