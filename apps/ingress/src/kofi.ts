import { z } from "zod";
import type { AlertType } from "@multi-stream-alerts/shared";

const kofiPayloadSchema = z
  .object({
    verification_token: z.string(),
    message_id: z.string(),
    type: z.string(),
    from_name: z.string().optional(),
    amount: z.union([z.string(), z.number()]).optional(),
    currency: z.string().optional(),
    message: z.string().optional(),
    is_public: z.union([z.string(), z.boolean()]).optional(),
    tier_name: z.string().optional()
  })
  .passthrough();

const typeMap: Record<string, AlertType> = {
  Tip: "tip",
  Subscription: "subscription",
  Commission: "commission",
  "Shop Order": "shop_order"
};

export function parseKofiFormData(body: { data?: unknown }) {
  if (typeof body.data !== "string") {
    throw new Error("Missing Ko-fi data field");
  }

  const parsed = kofiPayloadSchema.parse(parseKofiJson(body.data));
  const type = typeMap[parsed.type] ?? "tip";
  const isPublic = parseKofiBoolean(parsed.is_public);

  return {
    verificationToken: parsed.verification_token,
    rawEventId: parsed.message_id,
    event: {
      platform: "kofi" as const,
      type,
      displayName: parsed.from_name?.trim() || "Ko-fi supporter",
      amount: parseAmount(parsed.amount),
      currency: parsed.currency,
      message: isPublic === false ? undefined : parsed.message,
      isPublic,
      tier: parsed.tier_name,
      rawEventId: parsed.message_id,
      rawPayload: parsed
    }
  };
}

function parseKofiJson(data: string) {
  try {
    return JSON.parse(data);
  } catch {
    throw new Error("Malformed Ko-fi data JSON");
  }
}

function parseAmount(value: string | number | undefined) {
  if (value === undefined || value === "") {
    return undefined;
  }

  const amount = Number(value);
  return Number.isFinite(amount) ? amount : undefined;
}

function parseKofiBoolean(value: string | boolean | undefined) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return undefined;
}
