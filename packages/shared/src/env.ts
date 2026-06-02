import { z } from "zod";

/**
 * Environment variable schemas shared across the multi-stream-alerts monorepo.
 *
 * Platform credentials (Ko-Fi, Twitch, YouTube, etc.) are no longer
 * environment-based — they are configured per-channel from the dashboard and
 * stored encrypted at rest using INSTANCE_ENCRYPTION_KEY.
 */

export const commonEnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  DEFAULT_CHANNEL_SLUG: z.string().min(1),
  DEFAULT_CHANNEL_NAME: z.string().min(1),
  INITIAL_DISPLAY_KEY: z.string().min(16),
  PUBLIC_BASE_URL: z.string().min(1),
  INGRESS_PUBLIC_BASE_URL: z.string().min(1),
  INSTANCE_ENCRYPTION_KEY: z
    .string()
    .min(1)
    .refine((value) => Buffer.from(value, "base64").length === 32, {
      message:
        'INSTANCE_ENCRYPTION_KEY must be a base64-encoded 32-byte key (generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))")'
    })
});

export const authEnvSchema = z.object({
  AUTH_SECRET: z.string().min(16),
  AUTH_OIDC_ISSUER: z.string().min(1),
  AUTH_OIDC_CLIENT_ID: z.string().min(1),
  AUTH_OIDC_CLIENT_SECRET: z.string().min(1),
  INITIAL_ADMIN_EMAIL: z.string().email(),
  // Optional display name override for the OIDC sign-in button. Defaults
  // to "OIDC" when unset.
  AUTH_OIDC_PROVIDER_NAME: z.string().min(1).optional()
});

export const ingressEnvSchema = commonEnvSchema.extend({
  INGRESS_PORT: z.coerce.number().int().positive().default(8080)
});

export const webEnvSchema = commonEnvSchema.merge(authEnvSchema);

export function parseCommonEnv(env: NodeJS.ProcessEnv) {
  return commonEnvSchema.parse(env);
}

export function parseIngressEnv(env: NodeJS.ProcessEnv) {
  return ingressEnvSchema.parse(env);
}

export function parseWebEnv(env: NodeJS.ProcessEnv) {
  return webEnvSchema.parse(env);
}

export function parseBooleanEnv(value: string | undefined, defaultValue = false) {
  return z
    .enum(["true", "false"])
    .optional()
    .transform((parsedValue) => (parsedValue ? parsedValue === "true" : defaultValue))
    .parse(value);
}

/**
 * Returns the decoded INSTANCE_ENCRYPTION_KEY as a 32-byte Buffer.
 *
 * Thin wrapper around `process.env.INSTANCE_ENCRYPTION_KEY` that performs
 * the same base64/32-byte validation enforced by `commonEnvSchema`. Used by
 * downstream modules (e.g. secrets.ts) to derive AES-256 keys.
 */
export function getInstanceEncryptionKey(): Buffer {
  const value = process.env.INSTANCE_ENCRYPTION_KEY;

  if (!value) {
    throw new Error(
      'INSTANCE_ENCRYPTION_KEY must be a base64-encoded 32-byte key (generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))")'
    );
  }

  const decoded = Buffer.from(value, "base64");

  if (decoded.length !== 32) {
    throw new Error(
      `INSTANCE_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${decoded.length}). Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }

  return decoded;
}
