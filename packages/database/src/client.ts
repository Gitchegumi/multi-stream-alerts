import { PrismaClient, type AlertEvent as DbAlertEvent } from "@prisma/client";
import type { AlertEvent } from "@multi-stream-alerts/shared";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export function toAlertEvent(row: DbAlertEvent): AlertEvent {
  return {
    id: row.id,
    channelId: row.channelId,
    platform: row.platform,
    type: row.type,
    displayName: row.displayName,
    amount: row.amount ? Number(row.amount) : undefined,
    currency: row.currency ?? undefined,
    message: row.message ?? undefined,
    isPublic: row.isPublic ?? undefined,
    tier: row.tier ?? undefined,
    quantity: row.quantity ?? undefined,
    rawEventId: row.rawEventId,
    rawPayload: row.rawPayloadJson ?? undefined,
    createdAt: row.createdAt.toISOString()
  };
}
