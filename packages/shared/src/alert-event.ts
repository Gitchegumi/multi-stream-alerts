import { z } from "zod";

export const alertPlatforms = ["kofi", "twitch", "youtube", "tiktok", "manual"] as const;

export const alertTypes = [
  "tip",
  "follow",
  "subscription",
  "resubscription",
  "membership",
  "superchat",
  "supersticker",
  "raid",
  "cheer",
  "gift",
  "shop_order",
  "commission",
  "channel_point",
  "stream_online",
  "stream_offline",
  "test"
] as const;

export type AlertPlatform = (typeof alertPlatforms)[number];
export type AlertType = (typeof alertTypes)[number];

export const alertEventSchema = z.object({
  id: z.string().min(1),
  channelId: z.string().min(1),
  platform: z.enum(alertPlatforms),
  type: z.enum(alertTypes),
  displayName: z.string().min(1),
  amount: z.number().optional(),
  currency: z.string().min(1).optional(),
  message: z.string().optional(),
  isPublic: z.boolean().optional(),
  tier: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  rawEventId: z.string().min(1),
  rawPayload: z.unknown().optional(),
  createdAt: z.string().datetime()
});

export type AlertEvent = z.infer<typeof alertEventSchema>;

export const redisAlertChannel = "alerts:events";

export function serializeAlertEvent(event: AlertEvent): string {
  return JSON.stringify(alertEventSchema.parse(event));
}

export function parseAlertEvent(payload: string): AlertEvent {
  return alertEventSchema.parse(JSON.parse(payload));
}

export function overlayMessage(event: AlertEvent): string {
  if (event.isPublic === false || !event.message) {
    return safeFallbackMessage(event);
  }

  return event.message;
}

export function safeFallbackMessage(event: AlertEvent): string {
  const amount = event.amount && event.currency ? ` ${event.amount} ${event.currency}` : "";

  switch (event.type) {
    case "tip":
      return `${event.displayName} tipped${amount}`;
    case "subscription":
      return `${event.displayName} subscribed`;
    case "commission":
      return `${event.displayName} sent a commission`;
    case "shop_order":
      return `${event.displayName} placed a shop order`;
    case "test":
      return `${event.displayName} sent a test alert`;
    default:
      return `${event.displayName} triggered an alert`;
  }
}
