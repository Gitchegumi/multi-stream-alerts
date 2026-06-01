import { randomBytes, randomUUID } from "node:crypto";
import { prisma, toAlertEvent } from "./client";
import { publishAlertEvent } from "./redis";
import type { AlertEvent, AlertPlatform, AlertType } from "@multi-stream-alerts/shared";

export async function ensureDefaultChannel() {
  const slug = requiredEnv("DEFAULT_CHANNEL_SLUG");
  const name = requiredEnv("DEFAULT_CHANNEL_NAME");
  const displayKey = requiredEnv("INITIAL_DISPLAY_KEY");

  const channel = await prisma.channel.upsert({
    where: { slug },
    update: { name },
    create: { slug, name }
  });

  for (const profile of [
    { slug: "main", name: "Main" },
    { slug: "vertical", name: "Vertical" },
    { slug: "test", name: "Test" }
  ]) {
    await prisma.overlayProfile.upsert({
      where: { channelId_slug: { channelId: channel.id, slug: profile.slug } },
      update: {},
      create: {
        channelId: channel.id,
        slug: profile.slug,
        name: profile.name,
        displayKey: profile.slug === "main" ? displayKey : randomBytes(32).toString("hex"),
        settingsJson: {}
      }
    });
  }

  return channel;
}

export async function createStoredAlertEvent(input: {
  channelId: string;
  platform: AlertPlatform;
  type: AlertType;
  displayName: string;
  amount?: number;
  currency?: string;
  message?: string;
  isPublic?: boolean;
  tier?: string;
  quantity?: number;
  rawEventId: string;
  rawPayload?: unknown;
}) {
  const row = await prisma.alertEvent.create({
    data: {
      id: randomUUID(),
      channelId: input.channelId,
      platform: input.platform,
      type: input.type,
      displayName: input.displayName,
      amount: input.amount,
      currency: input.currency,
      message: input.isPublic === false ? undefined : input.message,
      isPublic: input.isPublic,
      tier: input.tier,
      quantity: input.quantity,
      rawEventId: input.rawEventId,
      rawPayloadJson: input.rawPayload === undefined ? undefined : JSON.parse(JSON.stringify(input.rawPayload))
    }
  });

  return toAlertEvent(row);
}

export async function storeAndPublishAlertEvent(input: Parameters<typeof createStoredAlertEvent>[0]): Promise<AlertEvent> {
  const event = await createStoredAlertEvent(input);
  await publishAlertEvent(event);
  return event;
}

export async function claimDeduplicationKey(input: { provider: string; rawEventId: string; channelId: string }) {
  try {
    await prisma.deduplicationKey.create({ data: input });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return false;
    }

    throw error;
  }
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
  );
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
