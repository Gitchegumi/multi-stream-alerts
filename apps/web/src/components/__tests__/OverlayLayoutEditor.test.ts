import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEditorLayout,
  serializeEditorLayout,
  type EditorLayout,
} from '../OverlayLayoutEditor.tsx';

const validLayout: EditorLayout = {
  version: 1,
  resolution: { width: 1920, height: 1080 },
  elements: [
    {
      id: 'element-1',
      type: 'text',
      name: 'Headline',
      x: 100,
      y: 120,
      width: 400,
      height: 90,
      zIndex: 3,
      visible: true,
      locked: false,
      properties: { textTemplate: '<b>escaped by React</b>', fontSize: 48 },
      assets: {},
    },
  ],
};

test('normalizeEditorLayout preserves valid versioned editor layouts', () => {
  const result = normalizeEditorLayout(validLayout);

  assert.deepEqual(result.warnings, []);
  assert.equal(result.layout.version, 1);
  assert.equal(result.layout.resolution.width, 1920);
  assert.equal(result.layout.elements[0]?.id, 'element-1');
  assert.equal(result.layout.elements[0]?.type, 'text');
  assert.equal(result.layout.elements[0]?.properties.textTemplate, '<b>escaped by React</b>');
});

test('normalizeEditorLayout falls back to legacy animationSettings editorLayout', () => {
  const result = normalizeEditorLayout({}, { editorLayout: validLayout });

  assert.deepEqual(result.warnings, []);
  assert.equal(result.layout.elements[0]?.name, 'Headline');
});

test('normalizeEditorLayout warns and repairs invalid element data', () => {
  const result = normalizeEditorLayout({
    version: 1,
    resolution: { width: '1920', height: '1080' },
    elements: [
      {
        id: 'bad-transform',
        type: 'image',
        name: 'Bad transform',
        x: -20,
        y: Number.NaN,
        width: -200,
        height: '99999',
        zIndex: -10,
        visible: 'yes',
        locked: 'no',
        properties: null,
        assets: [],
      },
      {
        id: 'future-widget',
        type: 'ticker',
      },
    ],
  });

  assert.match(result.warnings.join('\n'), /transform values were normalized/);
  assert.match(result.warnings.join('\n'), /type is unsupported/);
  assert.equal(result.layout.elements.length, 1);
  assert.equal(result.layout.elements[0]?.x, 0);
  assert.equal(result.layout.elements[0]?.y, 0);
  assert.equal(result.layout.elements[0]?.width, 1);
  assert.equal(result.layout.elements[0]?.height, 1080);
  assert.equal(result.layout.elements[0]?.zIndex, 0);
  assert.equal(result.layout.elements[0]?.visible, true);
  assert.equal(result.layout.elements[0]?.locked, false);
});

test('normalizeEditorLayout refuses future layout versions', () => {
  const result = normalizeEditorLayout({ ...validLayout, version: 99 });

  assert.match(result.warnings.join('\n'), /unsupported editor layout version 99/);
  assert.equal(result.layout.version, 1);
  assert.equal(result.layout.elements.length, 1);
  assert.equal(result.layout.elements[0]?.type, 'alert-box');
});

test('serializeEditorLayout writes the current schema version', () => {
  const result = serializeEditorLayout({ ...validLayout, version: 1 });

  assert.equal(result.version, 1);
  assert.equal(result.elements[0]?.id, 'element-1');
});
