import { prisma } from '@multi-stream-alerts/database';

const legacyOverlayProfiles = new Set(['main', 'vertical', 'test']);
const rateLimitWindowMs = 60_000;
const maxAttemptsPerWindow = 60;
const overlayRouteRateLimits = new Map<string, { count: number; resetAt: number }>();

export type OverlayProfileForAccess = {
  id: string;
  channelId: string;
  slug: string;
  displayKey: string;
  isActive: boolean;
  settingsJson: unknown;
};

export type OverlayAccessDeps = {
  prisma: {
    overlayProfile: {
      findFirst: (args: {
        where: {
          displayKey: string;
          slug: string;
          channel?: { slug: string };
        };
      }) => Promise<OverlayProfileForAccess | null>;
      findUnique: (args: {
        where: { displayKey: string };
      }) => Promise<OverlayProfileForAccess | null>;
    };
  };
};

const defaultDeps: OverlayAccessDeps = {
  prisma,
};

export async function resolveScopedOverlayProfile(input: {
  channelSlug: string;
  profileSlug: string;
  displayKey: string;
  deps?: OverlayAccessDeps;
}) {
  const deps = input.deps ?? defaultDeps;
  const profile = await deps.prisma.overlayProfile.findFirst({
    where: {
      displayKey: input.displayKey,
      slug: input.profileSlug,
      channel: { slug: input.channelSlug },
    },
  });

  return profile?.isActive ? profile : null;
}

export async function resolveLegacyOverlayProfile(input: {
  profileSlug: string;
  displayKey: string;
  deps?: OverlayAccessDeps;
}) {
  if (!legacyOverlayProfiles.has(input.profileSlug)) {
    return null;
  }

  const deps = input.deps ?? defaultDeps;
  const profile = await deps.prisma.overlayProfile.findUnique({
    where: { displayKey: input.displayKey },
  });

  return profile?.isActive && profile.slug === input.profileSlug ? profile : null;
}

export function isOverlayRouteRateLimited(clientIp: string) {
  const now = Date.now();
  const existing = overlayRouteRateLimits.get(clientIp);

  if (!existing || existing.resetAt <= now) {
    overlayRouteRateLimits.set(clientIp, { count: 1, resetAt: now + rateLimitWindowMs });
    cleanupExpiredRateLimits(now);
    return false;
  }

  existing.count += 1;
  return existing.count > maxAttemptsPerWindow;
}

export function getClientIp(source: { headers: Pick<Headers, 'get'> }) {
  const forwardedFor = source.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor || source.headers.get('x-real-ip') || 'unknown';
}

function cleanupExpiredRateLimits(now: number) {
  for (const [clientIp, limit] of overlayRouteRateLimits) {
    if (limit.resetAt <= now) {
      overlayRouteRateLimits.delete(clientIp);
    }
  }
}
