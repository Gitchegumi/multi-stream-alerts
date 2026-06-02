import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type AlertEvent as DbAlertEvent } from '@prisma/client';
import type { AlertEvent } from '@multi-stream-alerts/shared';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Prisma 7 requires a driver adapter for the "client" engine. The
// @prisma/adapter-pg adapter needs DATABASE_URL at construction time.
// We wrap construction in a lazy Proxy so that:
//   1. Importing this module does NOT require DATABASE_URL to be set
//      (only the first actual database call does). This keeps tests
//      that stub specific methods runnable without a live Postgres.
//   2. Tests that monkey-patch specific methods on the live `prisma`
//      export (e.g., swapping $transaction with a stub) continue to
//      work — the Proxy forwards `set` and `get` traps to the
//      underlying real client once it's been constructed.

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. The Prisma 7 client engine requires it ' +
        'at construction time to instantiate the pg driver adapter.',
    );
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

function makeLazyPrisma(): PrismaClient {
  let real: PrismaClient | undefined;
  const getReal = (): PrismaClient => {
    if (!real) {
      real = globalForPrisma.prisma ?? createPrismaClient();
      if (process.env.NODE_ENV !== 'production') {
        globalForPrisma.prisma = real;
      }
    }
    return real;
  };
  return new Proxy({} as PrismaClient, {
    get(_target, prop, receiver) {
      const r = getReal() as unknown as Record<PropertyKey, unknown>;
      const value = Reflect.get(r, prop, r);
      return typeof value === 'function' ? value.bind(r) : value;
    },
    set(_target, prop, value) {
      const r = getReal() as unknown as Record<PropertyKey, unknown>;
      Reflect.set(r, prop, value, r);
      return true;
    },
    has(_target, prop) {
      return Reflect.has(getReal() as object, prop);
    },
  });
}

export const prisma: PrismaClient = makeLazyPrisma();

export function toAlertEvent(row: DbAlertEvent): AlertEvent {
  return {
    id: row.id,
    channelId: row.channelId,
    platform: row.platform,
    type: row.type,
    eventKey: row.eventKey ?? undefined,
    layoutId: row.layoutId ?? undefined,
    layoutName: row.layoutName ?? undefined,
    layoutStyle: row.layoutStyle ?? undefined,
    durationMs: row.durationMs ?? undefined,
    volume: row.volume ?? undefined,
    templateText: row.templateText ?? undefined,
    visualAssetUrl: row.visualAssetUrl ?? undefined,
    soundAssetUrl: row.soundAssetUrl ?? undefined,
    displayName: row.displayName,
    amount: row.amount ? Number(row.amount) : undefined,
    currency: row.currency ?? undefined,
    message: row.message ?? undefined,
    isPublic: row.isPublic ?? undefined,
    tier: row.tier ?? undefined,
    quantity: row.quantity ?? undefined,
    rawEventId: row.rawEventId,
    rawPayload: row.rawPayloadJson ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}
