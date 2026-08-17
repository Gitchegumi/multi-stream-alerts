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

  assert.equal(
    markup,
    '<span>&lt;script&gt;alert(1)&lt;/script&gt;\n</span><span style="color:#fca311">SampleViewer</span>',
  );
});
