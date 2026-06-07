import { overlayMessage, type AlertEvent } from '@multi-stream-alerts/shared';

export type CanvasBackground = 'transparent' | 'dark';
export type CanvasElementType = 'text' | 'alert-message' | 'alert-image' | 'shape';

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
  };
  bindings: {
    textTemplate?: string;
    assetRole?: 'eventVisual';
    assetType?: 'image' | 'video';
    assetId?: string;
    assetUrl?: string;
  };
  animation: {
    in?: 'fade' | 'pop' | 'slide-up';
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

export function renderCanvasText(template: string, alert: AlertEvent | null) {
  const values = alert ? eventValues(alert) : sampleValues();
  return template.replace(/\{\{([a-zA-Z0-9]+)\}\}/g, (token, key: string) => {
    return values[key] ?? token;
  });
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
      bindings: { textTemplate: '{{viewerName}}' },
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
      bindings: { textTemplate: '{{viewerName}}: {{message}}' },
      animation: { in: 'pop', out: 'fade', durationMs: DEFAULT_DURATION_MS },
    },
    'alert-image': {
      width: 280,
      height: 280,
      styles: {},
      bindings: { assetRole: 'eventVisual', assetId: undefined, assetUrl: undefined },
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
      bindings: isRecord(value.bindings) ? { ...base.bindings, ...value.bindings } : base.bindings,
      animation: isRecord(value.animation)
        ? { ...base.animation, ...value.animation }
        : base.animation,
    },
  ];
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
