import { z } from 'zod';

export const alertPlatforms = ['generic', 'kofi', 'twitch', 'youtube', 'tiktok', 'manual'] as const;

export const alertTypes = [
  'tip',
  'follow',
  'subscription',
  'resubscription',
  'membership',
  'superchat',
  'supersticker',
  'raid',
  'cheer',
  'gift',
  'shop_order',
  'commission',
  'channel_point',
  'stream_online',
  'stream_offline',
  'test',
  'widget_event',
  'external_purchase',
  'hypechat',
  'charity_donation',
  'redemption',
] as const;

export type AlertPlatform = (typeof alertPlatforms)[number];
export type AlertType = (typeof alertTypes)[number];

export function isSafeAssetUrl(value: string): boolean {
  try {
    if (value.startsWith('/')) {
      return !value.startsWith('//');
    }

    const parsed = new URL(value, 'https://assets.local');
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      parsed.host !== 'assets.local' &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

export const safeAssetUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(isSafeAssetUrl, 'Asset URL must be http, https, or root-relative.');

export const alertEventSchema = z.object({
  id: z.string().min(1),
  channelId: z.string().min(1),
  platform: z.enum(alertPlatforms),
  type: z.enum(alertTypes),
  eventKey: z.string().min(1).optional(),
  layoutId: z.string().min(1).optional(),
  layoutName: z.string().min(1).optional(),
  layoutStyle: z.string().min(1).optional(),
  durationMs: z.number().int().positive().optional(),
  volume: z.number().int().min(0).max(100).optional(),
  templateText: z.string().optional(),
  visualAssetUrl: safeAssetUrlSchema.optional(),
  soundAssetUrl: safeAssetUrlSchema.optional(),
  displayName: z.string().min(1),
  amount: z.number().optional(),
  currency: z.string().min(1).optional(),
  message: z.string().optional(),
  isPublic: z.boolean().optional(),
  tier: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  rawEventId: z.string().min(1),
  rawPayload: z.unknown().optional(),
  createdAt: z.string().datetime(),
});

export type AlertEvent = z.infer<typeof alertEventSchema>;

export const redisAlertChannel = 'alerts:events';

export function serializeAlertEvent(event: AlertEvent): string {
  return JSON.stringify(alertEventSchema.parse(event));
}

export function parseAlertEvent(payload: string): AlertEvent {
  return alertEventSchema.parse(JSON.parse(payload));
}

export function overlayMessage(event: AlertEvent): string {
  if (event.templateText) {
    return renderAlertTemplate(event.templateText, event);
  }

  if (event.isPublic === false || !event.message) {
    return safeFallbackMessage(event);
  }

  return event.message;
}

export function safeFallbackMessage(event: AlertEvent): string {
  const amount = event.amount && event.currency ? ` ${event.amount} ${event.currency}` : '';

  switch (event.type) {
    case 'tip':
      return `${event.displayName} tipped${amount}`;
    case 'subscription':
      return `${event.displayName} subscribed`;
    case 'commission':
      return `${event.displayName} sent a commission`;
    case 'shop_order':
      return `${event.displayName} placed a shop order`;
    case 'follow':
      return `${event.displayName} followed`;
    case 'membership':
      return `${event.displayName} became a member`;
    case 'superchat':
      return `${event.displayName} sent a Superchat${amount}`;
    case 'raid':
      return `${event.displayName} raided`;
    case 'cheer':
      return `${event.displayName} cheered`;
    case 'gift':
      return `${event.displayName} gifted subs`;
    case 'hypechat':
      return `${event.displayName} sent a Hypechat`;
    case 'charity_donation':
      return `${event.displayName} made a charity donation`;
    case 'redemption':
      return `${event.displayName} redeemed a reward`;
    case 'widget_event':
      return `${event.displayName} triggered a widget event`;
    case 'test':
      return `${event.displayName} sent a test alert`;
    default:
      return `${event.displayName} triggered an alert`;
  }
}

function renderAlertTemplate(template: string, event: AlertEvent): string {
  const amount = event.amount && event.currency ? `${event.amount} ${event.currency}` : '';
  const replacements: Record<string, string> = {
    '{{name}}': event.displayName,
    '{{message}}': event.message ?? safeFallbackMessage(event),
    '{{amount}}': amount,
    '{{platform}}': event.platform,
    '{{event}}': event.eventKey ?? event.type,
  };

  return template
    .split(/({{name}}|{{message}}|{{amount}}|{{platform}}|{{event}})/g)
    .map((part) => escapeHtml(replacements[part] ?? part))
    .join('');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}
