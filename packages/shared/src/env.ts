import { z } from "zod";

const optionalBooleanString = z
  .string()
  .optional()
  .transform((value) => value === "true");

const optionalBooleanStringWithDefault = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined ? defaultValue : value === "true"));

export const commonEnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  DEFAULT_CHANNEL_SLUG: z.string().min(1),
  DEFAULT_CHANNEL_NAME: z.string().min(1),
  INITIAL_DISPLAY_KEY: z.string().min(16),
  PUBLIC_BASE_URL: z.string().min(1),
  INGRESS_PUBLIC_BASE_URL: z.string().min(1)
});

export const authEnvSchema = z.object({
  AUTH_SECRET: z.string().min(16),
  AUTH_OIDC_ISSUER: z.string().min(1),
  AUTH_OIDC_CLIENT_ID: z.string().min(1),
  AUTH_OIDC_CLIENT_SECRET: z.string().min(1),
  INITIAL_ADMIN_EMAIL: z.string().email(),
  ALLOW_AUTO_PROVISION: optionalBooleanString,
  ENABLE_LOCAL_REGISTRATION: optionalBooleanStringWithDefault(false),
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).max(128).default(12)
});

export const ingressEnvSchema = commonEnvSchema.extend({
  KOFI_VERIFICATION_TOKEN: z.string().min(1),
  TWITCH_EVENTSUB_SECRET: z.string().min(1).optional(),
  TWITCH_CLIENT_ID: z.string().min(1).optional(),
  TWITCH_CLIENT_SECRET: z.string().min(1).optional(),
  YOUTUBE_CLIENT_ID: z.string().min(1).optional(),
  YOUTUBE_CLIENT_SECRET: z.string().min(1).optional(),
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
