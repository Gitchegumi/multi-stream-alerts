import { z } from 'zod';

/**
 * Redis pub/sub channel carrying canvas settings updates so open browser
 * sources can hot-swap their layout without a page reload.
 */
export const redisOverlaySettingsChannel = 'overlay:settings';

export const overlaySettingsUpdateSchema = z.object({
  profileId: z.string().min(1),
  channelId: z.string().min(1),
  /** Canvas settings JSON; the web app owns and validates the exact shape. */
  settings: z.record(z.string(), z.unknown()),
  updatedAt: z.string().datetime(),
});

export type OverlaySettingsUpdate = z.infer<typeof overlaySettingsUpdateSchema>;

export function serializeOverlaySettingsUpdate(update: OverlaySettingsUpdate): string {
  return JSON.stringify(overlaySettingsUpdateSchema.parse(update));
}

export function parseOverlaySettingsUpdate(payload: string): OverlaySettingsUpdate {
  return overlaySettingsUpdateSchema.parse(JSON.parse(payload));
}
