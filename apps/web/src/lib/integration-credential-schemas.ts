import { z } from 'zod';
import type { IntegrationCredentialKey } from '@multi-stream-alerts/database';

// Per-provider input schemas for PUT /api/channels/:slug/integrations/:provider.
//
// Sentinel convention: a value of "" means "clear this field". A non-empty
// string is the new secret value to encrypt+save. Mixed semantics inside a
// single PUT body are allowed — see apps/web/src/app/api/channels/[channelSlug]/
// integrations/[provider]/route.ts for the implementation.
//
// Length/format constraints here are intentionally separate from the
// database-layer key-name validation in
// packages/database/src/integration-credentials.ts. The DB layer validates
// that the key is a known `IntegrationCredentialKey`; the API layer
// validates the per-field value constraints (length, regex). Both layers
// are needed.

export const kofiInputSchema = z.object({
  verificationToken: z.string().max(256), // empty allowed -> clear
});

export const twitchInputSchema = z.object({
  eventsubSecret: z.string().min(16).max(256).optional(), // required keys get a min length when saving
  clientId: z.string().min(1).max(128).optional(),
  clientSecret: z.string().min(1).max(256).optional(),
  broadcasterId: z.string().regex(/^\d+$/).optional(), // public field
});

export const youtubeInputSchema = z.object({
  clientId: z.string().min(1).max(128).optional(),
  clientSecret: z.string().min(1).max(256).optional(),
});

// DELETE body: either a single key to clear, or all secrets for the provider.
export const deleteInputSchema = z.union([
  z.object({ key: z.string().min(1), all: z.literal(false).optional() }),
  z.object({ all: z.literal(true) }),
]);

// Provider type guard
export function isProvider(value: string): value is 'kofi' | 'twitch' | 'youtube' {
  return value === 'kofi' || value === 'twitch' || value === 'youtube';
}

export function getInputSchemaForProvider(provider: 'kofi' | 'twitch' | 'youtube') {
  switch (provider) {
    case 'kofi':
      return kofiInputSchema;
    case 'twitch':
      return twitchInputSchema;
    case 'youtube':
      return youtubeInputSchema;
  }
}

// Map API field names (camelCase) to DB credential keys (snake_case).
// The two-credential providers (twitch, youtube) share the camelCase
// `clientId`/`clientSecret` field names but the DB keys differ by
// provider prefix. The Zod schemas are kept simple and identical for
// ergonomics; we resolve ambiguity here using the provider context.

/**
 * Resolve a Zod-schema field name + provider pair to the DB credential
 * key. Returns null if the field is not a known credential key for
 * that provider (e.g. `broadcasterId` is a public field, not a secret).
 */
export function fieldToDbKey(
  provider: 'kofi' | 'twitch' | 'youtube',
  field: string,
): IntegrationCredentialKey | null {
  if (provider === 'twitch') {
    if (field === 'eventsubSecret') return 'twitch.eventsub_secret';
    if (field === 'clientId') return 'twitch.client_id';
    if (field === 'clientSecret') return 'twitch.client_secret';
    return null;
  }
  if (provider === 'youtube') {
    if (field === 'clientId') return 'youtube.client_id';
    if (field === 'clientSecret') return 'youtube.client_secret';
    return null;
  }
  // kofi
  if (provider === 'kofi' && field === 'verificationToken') {
    return 'kofi.verification_token';
  }
  return null;
}
