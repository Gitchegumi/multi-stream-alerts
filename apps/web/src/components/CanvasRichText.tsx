import type { AlertEvent } from '@multi-stream-alerts/shared';
import React from 'react';
import {
  renderCanvasRichText,
  type CanvasRichText as CanvasRichTextValue,
} from '@/lib/canvas-schema';

export function CanvasRichText({
  content,
  alert,
}: {
  content: CanvasRichTextValue;
  alert: AlertEvent | null;
}) {
  return renderCanvasRichText(content, alert).map((span, index) => (
    <span key={index} style={{ color: span.styles.color }}>
      {span.text}
    </span>
  ));
}
