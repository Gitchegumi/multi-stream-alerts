import test from 'node:test';
import assert from 'node:assert/strict';
import { insertTokenAt, CONTENT_PLACEHOLDER } from '../canvas-editor/EditorInspector';

// Regression tests for issue #109: the inspector Content textarea was showing
// placeholder/helper text and the typed value at the same time because a
// transparent token overlay was positioned on top of the textarea. The fix
// removes the overlay and relies on the native `placeholder` attribute, which
// the browser only shows when the value is empty. These tests guard the pure
// logic that replaced the inline string manipulation.

test('CONTENT_PLACEHOLDER is a non-empty string', () => {
  assert.ok(CONTENT_PLACEHOLDER.length > 0);
  assert.ok(CONTENT_PLACEHOLDER.includes('{{viewerName}}'));
});

test('insertTokenAt appends token when start and end are at the end', () => {
  const result = insertTokenAt('Hello ', '{{viewerName}}', 6, 6);
  assert.equal(result, 'Hello {{viewerName}}');
});

test('insertTokenAt inserts token at cursor position in the middle', () => {
  const template = '{{viewerName}} sent a tip';
  // Insert {{amount}} at position 14 (after the closing brace, before the space)
  const result = insertTokenAt(template, '{{amount}} ', 14, 14);
  assert.equal(result, '{{viewerName}}{{amount}}  sent a tip');
});

test('insertTokenAt replaces selected range with token', () => {
  const template = '{{viewerName}} said hello';
  // Replace "said" (positions 15-19) with {{message}}
  const result = insertTokenAt(template, '{{message}}', 15, 19);
  assert.equal(result, '{{viewerName}} {{message}} hello');
});

test('insertTokenAt handles empty template', () => {
  const result = insertTokenAt('', '{{viewerName}}', 0, 0);
  assert.equal(result, '{{viewerName}}');
});

test('insertTokenAt handles multi-line template', () => {
  const template = '{{viewerName}}\n{{message}}';
  // Insert {{amount}} at the beginning
  const result = insertTokenAt(template, '{{amount}}\n', 0, 0);
  assert.equal(result, '{{amount}}\n{{viewerName}}\n{{message}}');
});

test('insertTokenAt with empty token returns the template unchanged for zero-width selection', () => {
  const template = 'hello world';
  const result = insertTokenAt(template, '', 5, 5);
  assert.equal(result, 'hello world');
});

test('insertTokenAt with empty token and selection range deletes the selection', () => {
  const template = 'hello world';
  const result = insertTokenAt(template, '', 5, 11);
  assert.equal(result, 'hello');
});
