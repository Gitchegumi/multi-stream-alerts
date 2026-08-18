import { overlayMessage, type AlertEvent } from '@multi-stream-alerts/shared';

export type CanvasBackground = 'transparent' | 'dark';
export type CanvasElementType = 'text' | 'alert-message' | 'alert-image' | 'shape';

export type CanvasTextStyle = {
  color?: string;
};

export type CanvasTextSpan = {
  text: string;
  styles: CanvasTextStyle;
};

/** Controlled rich-text content. New inline styles can be added to CanvasTextStyle. */
export type CanvasRichText = {
  spans: CanvasTextSpan[];
};

export type CanvasElement = {
  id: string;
  type: CanvasElementType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  locked: boolean;
  hidden: boolean;
  styles: {
    color?: string;
    backgroundColor?: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    borderRadius?: number;
    textShadow?: string;
    textStrokeColor?: string;
    textStrokeWidth?: number;
  };
  bindings: {
    richText?: CanvasRichText;
    assetRole?: 'eventVisual';
    assetType?: 'image' | 'video';
    assetId?: string;
    assetUrl?: string;
    /** Whether the audio track of a bound video asset is disabled. */
    videoMuted?: boolean;
    /** Video-track volume as a percentage, independent of canvas sound audio. */
    videoVolume?: number;
  };
  animation: {
    // `none` intentionally disables any editor-applied entrance animation so the
    // asset renders exactly as provided (issue #122). It is a valid, saved value
    // — distinct from an unset animation, which still defaults to `fade`.
    in?: 'none' | 'fade' | 'pop' | 'slide-up';
    out?: 'fade';
    durationMs?: number;
    delayMs?: number;
  };
};

export type CanvasSettings = {
  width: number;
  height: number;
  background: CanvasBackground;
  alertEventKeys: string[];
  elements: CanvasElement[];
  defaultDurationMs: number;
  audioAssetId: string | null;
  audioAssetUrl: string | null;
  volume: number;
};

export type CanvasSchemaResult = {
  settings: CanvasSettings;
  warnings: string[];
};

export const EVENT_VARIABLES = [
  '{{viewerName}}',
  '{{amount}}',
  '{{message}}',
  '{{tier}}',
  '{{months}}',
  '{{platform}}',
  '{{eventType}}',
] as const;

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_DURATION_MS = 6500;
const BRAND_SOFT_WHITE = '#f0f0f0';
const BRAND_PANEL = 'rgba(35, 37, 43, 0.9)';
const BRAND_ACCENT = '#fca311';

export function normalizeCanvasSettings(
  value: unknown,
  fallbackEventKeys: string[] = [],
): CanvasSchemaResult {
  const warnings: string[] = [];
  const raw = isRecord(value) ? value : {};
  const width = coerceNumber(raw.width, DEFAULT_WIDTH, 320, 7680);
  const height = coerceNumber(raw.height, DEFAULT_HEIGHT, 240, 4320);
  const alertEventKeys = Array.isArray(raw.alertEventKeys)
    ? raw.alertEventKeys.filter(isNonEmptyString)
    : fallbackEventKeys;
  const elements = Array.isArray(raw.elements)
    ? raw.elements.flatMap((element, index) =>
        normalizeElement(element, index, width, height, warnings),
      )
    : [];

  if (raw.elements !== undefined && !Array.isArray(raw.elements)) {
    warnings.push('canvas elements were reset because they were not an array');
  }

  return {
    settings: {
      width,
      height,
      background: raw.background === 'dark' ? 'dark' : 'transparent',
      alertEventKeys,
      elements: elements.length ? elements : createDefaultCanvasElements(width, height),
      defaultDurationMs: coerceNumber(raw.defaultDurationMs, DEFAULT_DURATION_MS, 500, 60000),
      audioAssetId: isNonEmptyString(raw.audioAssetId) ? raw.audioAssetId : null,
      audioAssetUrl: isNonEmptyString(raw.audioAssetUrl) ? raw.audioAssetUrl : null,
      volume: coerceNumber(raw.volume, 80, 0, 100),
    },
    warnings,
  };
}

export function serializeCanvasSettings(settings: CanvasSettings): CanvasSettings {
  return {
    width: settings.width,
    height: settings.height,
    background: settings.background,
    alertEventKeys: [...new Set(settings.alertEventKeys.filter(isNonEmptyString))],
    elements: settings.elements.map((element) => ({
      ...element,
      x: clamp(Math.round(element.x), 0, settings.width - 1),
      y: clamp(Math.round(element.y), 0, settings.height - 1),
      width: clamp(Math.round(element.width), 1, settings.width),
      height: clamp(Math.round(element.height), 1, settings.height),
      zIndex: clamp(Math.round(element.zIndex), 0, 10000),
      rotation: clamp(Math.round(element.rotation), -360, 360),
      opacity: clamp(Number(element.opacity), 0, 1),
      bindings: {
        ...element.bindings,
        videoVolume:
          element.bindings.videoVolume === undefined
            ? undefined
            : clamp(Math.round(element.bindings.videoVolume), 0, 100),
      },
    })),
    defaultDurationMs: clamp(Math.round(settings.defaultDurationMs), 500, 60000),
    audioAssetId: settings.audioAssetId,
    audioAssetUrl: settings.audioAssetUrl,
    volume: clamp(Math.round(settings.volume), 0, 100),
  };
}

export function shouldRenderAlertOnCanvas(
  settings: Pick<CanvasSettings, 'alertEventKeys'>,
  alert: AlertEvent,
) {
  const assignedKeys = new Set(settings.alertEventKeys);
  return assignedKeys.size === 0 || Boolean(alert.eventKey && assignedKeys.has(alert.eventKey));
}

export function plainTextToCanvasRichText(text: string): CanvasRichText {
  return { spans: [{ text, styles: {} }] };
}

export function canvasRichTextToPlainText(content: CanvasRichText): string {
  return content.spans.map((span) => span.text).join('');
}

/**
 * Resolve event variables without losing the controlled style attached to the
 * source range. A variable split across spans uses the style at its first
 * character, while ordinary text keeps each span's exact formatting.
 */
export function renderCanvasRichText(
  content: CanvasRichText,
  alert: AlertEvent | null,
): CanvasTextSpan[] {
  const source = canvasRichTextToPlainText(content);
  const values = alert ? eventValues(alert) : sampleValues();
  const rendered: CanvasTextSpan[] = [];
  const variablePattern = /\{\{([a-zA-Z0-9]+)\}\}/g;
  let sourceOffset = 0;
  let match: RegExpExecArray | null;

  while ((match = variablePattern.exec(source))) {
    appendSourceRange(rendered, content, sourceOffset, match.index);
    const token = match[0];
    const replacement = values[match[1] ?? ''] ?? token;
    rendered.push({ text: replacement, styles: styleAtOffset(content, match.index) });
    sourceOffset = match.index + token.length;
  }
  appendSourceRange(rendered, content, sourceOffset, source.length);
  return mergeCanvasTextSpans(rendered);
}

/** Apply a color to exactly the selected source range. */
export function applyCanvasTextColor(
  content: CanvasRichText,
  start: number,
  end: number,
  color: string,
): CanvasRichText {
  const length = canvasRichTextToPlainText(content).length;
  const rangeStart = clamp(Math.min(start, end), 0, length);
  const rangeEnd = clamp(Math.max(start, end), 0, length);
  if (rangeStart === rangeEnd) return content;

  return {
    spans: transformCanvasTextRange(content, rangeStart, rangeEnd, (text, styles) => ({
      text,
      styles: { ...styles, color: sanitizeColor(color) },
    })),
  };
}

/** Preserve span formatting while applying a native textarea edit. */
export function updateCanvasRichText(content: CanvasRichText, nextText: string): CanvasRichText {
  const previousText = canvasRichTextToPlainText(content);
  if (previousText === nextText) return content;

  let start = 0;
  while (
    start < previousText.length &&
    start < nextText.length &&
    previousText[start] === nextText[start]
  ) {
    start += 1;
  }
  let previousEnd = previousText.length;
  let nextEnd = nextText.length;
  while (
    previousEnd > start &&
    nextEnd > start &&
    previousText[previousEnd - 1] === nextText[nextEnd - 1]
  ) {
    previousEnd -= 1;
    nextEnd -= 1;
  }

  const insertionStyle = styleAtOffset(content, start > 0 ? start - 1 : start);
  const spans: CanvasTextSpan[] = [];
  appendSourceRange(spans, content, 0, start);
  const insertion = nextText.slice(start, nextEnd);
  spans.push({ text: insertion, styles: insertionStyle });
  appendSourceRange(spans, content, previousEnd, previousText.length);
  return { spans: mergeCanvasTextSpans(spans) };
}

/** Visual asset kinds an `alert-image` element can render. */
export type CanvasAssetKind = 'image' | 'video';

/** A resolved visual asset ready to render, or `null` when none is available. */
export type ResolvedCanvasAsset = { url: string; kind: CanvasAssetKind } | null;

/** File extensions rendered with a `<video>` element rather than `<img>`. */
const VIDEO_URL_PATTERN = /\.(mp4|webm)(\?|$)/i;

/**
 * Decide whether a resolved asset URL should render as a video or an image.
 * Prefers the explicit asset type when known, otherwise falls back to the file
 * extension. Animated GIF/WebP are `image` and animate natively in `<img>`.
 */
export function resolveAssetKind(
  assetType: string | null | undefined,
  url: string,
): CanvasAssetKind {
  if (assetType === 'video') return 'video';
  if (assetType === 'image') return 'image';
  return VIDEO_URL_PATTERN.test(url) ? 'video' : 'image';
}

/**
 * Resolve the visual asset for an `alert-image` element across the editor
 * preview, test alert, and browser-source rendering paths. Chooses the first
 * available URL — the element's stored asset, then a bound external URL, then
 * the visual asset carried by the alert/event — and picks the render kind.
 *
 * Callers supply the already-resolved stored asset URL because the editor uses
 * an in-memory preview URL while the browser source builds a keyed content URL.
 */
export function resolveCanvasElementAsset(
  element: Pick<CanvasElement, 'bindings'>,
  options: {
    /** Resolved URL for the element's stored asset, if one is bound. */
    storedAssetUrl?: string | null;
    /** Asset type of the stored asset, when known (authoritative). */
    storedAssetType?: string | null;
    /** Fallback visual URL carried by the alert/event. */
    eventVisualUrl?: string | null;
  } = {},
): ResolvedCanvasAsset {
  const url = options.storedAssetUrl ?? element.bindings.assetUrl ?? options.eventVisualUrl ?? null;
  if (!url) return null;
  const assetType = options.storedAssetType ?? element.bindings.assetType;
  return { url, kind: resolveAssetKind(assetType, url) };
}

export function createCanvasElement(
  type: CanvasElementType,
  count: number,
  zIndex: number,
): CanvasElement {
  const defaults: Record<
    CanvasElementType,
    Pick<CanvasElement, 'width' | 'height' | 'styles' | 'bindings' | 'animation'>
  > = {
    text: {
      width: 620,
      height: 112,
      styles: {
        color: BRAND_SOFT_WHITE,
        fontSize: 48,
        fontWeight: '800',
        textShadow: '0 4px 18px rgba(0, 0, 0, 0.55)',
      },
      bindings: { richText: plainTextToCanvasRichText('{{viewerName}}') },
      animation: { in: 'fade', out: 'fade', durationMs: DEFAULT_DURATION_MS },
    },
    'alert-message': {
      width: 860,
      height: 210,
      styles: {
        color: BRAND_SOFT_WHITE,
        backgroundColor: BRAND_PANEL,
        fontSize: 42,
        fontWeight: '800',
        borderRadius: 8,
      },
      bindings: { richText: plainTextToCanvasRichText('{{viewerName}}: {{message}}') },
      animation: { in: 'pop', out: 'fade', durationMs: DEFAULT_DURATION_MS },
    },
    'alert-image': {
      width: 280,
      height: 280,
      styles: {},
      bindings: {
        assetRole: 'eventVisual',
        assetId: undefined,
        assetUrl: undefined,
        videoMuted: false,
        videoVolume: 100,
      },
      animation: { in: 'pop', out: 'fade', durationMs: DEFAULT_DURATION_MS },
    },
    shape: {
      width: 900,
      height: 260,
      styles: { backgroundColor: 'rgba(65, 102, 245, 0.78)', borderRadius: 8 },
      bindings: {},
      animation: { in: 'fade', out: 'fade', durationMs: DEFAULT_DURATION_MS },
    },
  };
  return {
    id: `canvas-${type}-${Date.now()}-${count}`,
    type,
    name: `${labelForType(type)} ${count}`,
    x: 180 + count * 28,
    y: 150 + count * 28,
    width: defaults[type].width,
    height: defaults[type].height,
    rotation: 0,
    opacity: 1,
    zIndex,
    locked: false,
    hidden: false,
    styles: defaults[type].styles,
    bindings: defaults[type].bindings,
    animation: defaults[type].animation,
  };
}

function createDefaultCanvasElements(width: number, height: number): CanvasElement[] {
  const image = createCanvasElement('alert-image', 1, 1);
  const message = createCanvasElement('alert-message', 1, 2);
  image.x = Math.round(width / 2 - image.width / 2);
  image.y = Math.round(height / 2 - image.height - 96);
  message.x = Math.round(width / 2 - message.width / 2);
  message.y = Math.round(height / 2 + 12);
  return [image, message];
}

function normalizeElement(
  value: unknown,
  index: number,
  canvasWidth: number,
  canvasHeight: number,
  warnings: string[],
) {
  if (!isRecord(value)) {
    warnings.push(`canvas element ${index + 1} was skipped because it is not an object`);
    return [];
  }
  if (!isCanvasElementType(value.type)) {
    warnings.push(`canvas element ${index + 1} was skipped because its type is unsupported`);
    return [];
  }
  const base = createCanvasElement(value.type, index + 1, index + 1);
  const width = coerceNumber(value.width, base.width, 1, canvasWidth);
  const height = coerceNumber(value.height, base.height, 1, canvasHeight);
  return [
    {
      ...base,
      id: isNonEmptyString(value.id) ? value.id : base.id,
      name: isNonEmptyString(value.name) ? value.name : base.name,
      x: coerceNumber(value.x, base.x, 0, canvasWidth - width),
      y: coerceNumber(value.y, base.y, 0, canvasHeight - height),
      width,
      height,
      rotation: coerceNumber(value.rotation, 0, -360, 360),
      opacity: coerceNumber(value.opacity, 1, 0, 1),
      zIndex: coerceNumber(value.zIndex, base.zIndex, 0, 10000),
      locked: typeof value.locked === 'boolean' ? value.locked : false,
      hidden: typeof value.hidden === 'boolean' ? value.hidden : false,
      styles: isRecord(value.styles) ? { ...base.styles, ...value.styles } : base.styles,
      bindings: normalizeBindings(value.bindings, base.bindings),
      animation: isRecord(value.animation)
        ? { ...base.animation, ...value.animation }
        : base.animation,
    },
  ];
}

function normalizeBindings(value: unknown, fallback: CanvasElement['bindings']) {
  if (!isRecord(value)) return fallback;
  return {
    richText: normalizeCanvasRichText(value.richText, fallback.richText),
    assetRole: value.assetRole === 'eventVisual' ? value.assetRole : fallback.assetRole,
    assetType:
      value.assetType === 'image' || value.assetType === 'video'
        ? value.assetType
        : fallback.assetType,
    assetId: isNonEmptyString(value.assetId) ? value.assetId : fallback.assetId,
    assetUrl: isNonEmptyString(value.assetUrl) ? value.assetUrl : fallback.assetUrl,
    videoMuted: typeof value.videoMuted === 'boolean' ? value.videoMuted : false,
    videoVolume: coerceNumber(value.videoVolume, 100, 0, 100),
  };
}

function normalizeCanvasRichText(
  value: unknown,
  fallback: CanvasRichText | undefined,
): CanvasRichText | undefined {
  if (!isRecord(value) || !Array.isArray(value.spans)) return fallback;
  const spans = value.spans.flatMap((span): CanvasTextSpan[] => {
    if (!isRecord(span) || typeof span.text !== 'string') return [];
    const styles = isRecord(span.styles) ? span.styles : {};
    const color = typeof styles.color === 'string' ? sanitizeColor(styles.color) : undefined;
    return [
      {
        text: span.text,
        styles: color ? { color } : {},
      },
    ];
  });
  return { spans: mergeCanvasTextSpans(spans) };
}

function appendSourceRange(
  target: CanvasTextSpan[],
  content: CanvasRichText,
  start: number,
  end: number,
) {
  if (start >= end) return;
  let offset = 0;
  for (const span of content.spans) {
    const spanEnd = offset + span.text.length;
    const sliceStart = Math.max(start, offset);
    const sliceEnd = Math.min(end, spanEnd);
    if (sliceStart < sliceEnd) {
      target.push({
        text: span.text.slice(sliceStart - offset, sliceEnd - offset),
        styles: { ...span.styles },
      });
    }
    offset = spanEnd;
  }
}

function transformCanvasTextRange(
  content: CanvasRichText,
  start: number,
  end: number,
  transform: (text: string, styles: CanvasTextStyle) => CanvasTextSpan | null,
) {
  const result: CanvasTextSpan[] = [];
  appendSourceRange(result, content, 0, start);
  const selected: CanvasTextSpan[] = [];
  appendSourceRange(selected, content, start, end);
  for (const span of selected) {
    const transformed = transform(span.text, span.styles);
    if (transformed) result.push(transformed);
  }
  appendSourceRange(result, content, end, canvasRichTextToPlainText(content).length);
  return mergeCanvasTextSpans(result);
}

function styleAtOffset(content: CanvasRichText, requestedOffset: number): CanvasTextStyle {
  let offset = 0;
  for (const span of content.spans) {
    if (requestedOffset < offset + span.text.length) return { ...span.styles };
    offset += span.text.length;
  }
  return { ...(content.spans.at(-1)?.styles ?? {}) };
}

function mergeCanvasTextSpans(spans: CanvasTextSpan[]): CanvasTextSpan[] {
  const merged: CanvasTextSpan[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const previous = merged.at(-1);
    if (previous && previous.styles.color === span.styles.color) {
      previous.text += span.text;
    } else {
      merged.push({ text: span.text, styles: { ...span.styles } });
    }
  }
  return merged.length ? merged : [{ text: '', styles: {} }];
}

function sanitizeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
}

function eventValues(alert: AlertEvent): Record<string, string> {
  return {
    viewerName: alert.displayName,
    amount: alert.amount ? String(alert.amount) : '',
    message: overlayMessage(alert),
    tier: alert.tier ?? '',
    months: alert.quantity ? String(alert.quantity) : '',
    platform: alert.platform,
    eventType: eventTypeAction(alert.type),
  };
}

function sampleValues(): Record<string, string> {
  return {
    viewerName: 'SampleViewer',
    amount: '25',
    message: 'Thanks for the alert!',
    tier: 'Prime',
    months: '6',
    platform: 'twitch',
    eventType: 'followed',
  };
}

function eventTypeAction(type: AlertEvent['type']) {
  const labels: Record<AlertEvent['type'], string> = {
    tip: 'tipped',
    follow: 'followed',
    subscription: 'subscribed',
    resubscription: 'resubscribed',
    membership: 'became a member',
    superchat: 'sent a Superchat',
    supersticker: 'sent a Super Sticker',
    raid: 'raided',
    cheer: 'cheered',
    gift: 'gifted subs',
    shop_order: 'placed a shop order',
    commission: 'sent a commission',
    channel_point: 'redeemed channel points',
    stream_online: 'went live',
    stream_offline: 'ended stream',
    test: 'sent a test alert',
    widget_event: 'triggered a widget event',
    external_purchase: 'made a purchase',
    hypechat: 'sent a Hypechat',
    charity_donation: 'made a charity donation',
    redemption: 'redeemed a reward',
  };
  return labels[type] ?? 'triggered an alert';
}

function isCanvasElementType(value: unknown): value is CanvasElementType {
  return (
    value === 'text' || value === 'alert-message' || value === 'alert-image' || value === 'shape'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function coerceNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === 'number' || typeof value === 'string' ? Number(value) : fallback;
  return clamp(Number.isFinite(numeric) ? numeric : fallback, min, max);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function labelForType(type: CanvasElementType) {
  return type
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
