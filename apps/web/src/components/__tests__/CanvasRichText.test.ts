import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CanvasRichText } from '../CanvasRichText.tsx';

test('CanvasRichText escapes content and preserves controlled span colors and newlines', () => {
  const markup = renderToStaticMarkup(
    createElement(CanvasRichText, {
      content: {
        spans: [
          { text: '<script>alert(1)</script>\n', styles: {} },
          { text: '{{viewerName}}', styles: { color: '#fca311' } },
        ],
      },
      alert: null,
    }),
  );

  assert.match(markup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;\n/);
  assert.match(markup, /style="color:#fca311">SampleViewer<\/span>/);
  assert.doesNotMatch(markup, /<script>/);
});
