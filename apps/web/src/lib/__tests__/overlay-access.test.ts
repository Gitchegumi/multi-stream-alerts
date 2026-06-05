import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getClientIp,
  resolveLegacyOverlayProfile,
  resolveScopedOverlayProfile,
  type OverlayAccessDeps,
  type OverlayProfileForAccess,
} from '../overlay-access.ts';

function makeProfile(overrides: Partial<OverlayProfileForAccess> = {}): OverlayProfileForAccess {
  return {
    id: overrides.id ?? 'profile-1',
    channelId: overrides.channelId ?? 'channel-1',
    slug: overrides.slug ?? 'main',
    displayKey: overrides.displayKey ?? 'display-key',
    isActive: overrides.isActive ?? true,
    settingsJson: overrides.settingsJson ?? {},
  };
}

function makeDeps(profile: OverlayProfileForAccess | null): OverlayAccessDeps {
  return {
    prisma: {
      overlayProfile: {
        findFirst: async (args) => {
          if (!profile) return null;
          if (args.where.channel?.slug !== 'main') return null;
          if (args.where.slug !== profile.slug) return null;
          if (args.where.displayKey !== profile.displayKey) return null;
          return profile;
        },
        findUnique: async (args) =>
          profile?.displayKey === args.where.displayKey ? profile : null,
      },
    },
  };
}

test('resolveScopedOverlayProfile requires channel slug, profile slug, display key, and active status', async () => {
  const deps = makeDeps(makeProfile({ slug: 'canvas-a', displayKey: 'key-a' }));

  assert.equal(
    await resolveScopedOverlayProfile({
      channelSlug: 'main',
      profileSlug: 'canvas-a',
      displayKey: 'key-a',
      deps,
    }),
    await deps.prisma.overlayProfile.findUnique({ where: { displayKey: 'key-a' } }),
  );

  assert.equal(
    await resolveScopedOverlayProfile({
      channelSlug: 'other',
      profileSlug: 'canvas-a',
      displayKey: 'key-a',
      deps,
    }),
    null,
  );
  assert.equal(
    await resolveScopedOverlayProfile({
      channelSlug: 'main',
      profileSlug: 'canvas-b',
      displayKey: 'key-a',
      deps,
    }),
    null,
  );
  assert.equal(
    await resolveScopedOverlayProfile({
      channelSlug: 'main',
      profileSlug: 'canvas-a',
      displayKey: 'wrong',
      deps,
    }),
    null,
  );
});

test('resolveScopedOverlayProfile rejects inactive canvases', async () => {
  const result = await resolveScopedOverlayProfile({
    channelSlug: 'main',
    profileSlug: 'canvas-a',
    displayKey: 'key-a',
    deps: makeDeps(makeProfile({ slug: 'canvas-a', displayKey: 'key-a', isActive: false })),
  });

  assert.equal(result, null);
});

test('resolveLegacyOverlayProfile only permits bootstrap overlay slugs', async () => {
  assert.equal(
    await resolveLegacyOverlayProfile({
      profileSlug: 'custom-canvas',
      displayKey: 'key-a',
      deps: makeDeps(makeProfile({ slug: 'custom-canvas', displayKey: 'key-a' })),
    }),
    null,
  );

  const legacy = await resolveLegacyOverlayProfile({
    profileSlug: 'main',
    displayKey: 'key-a',
    deps: makeDeps(makeProfile({ slug: 'main', displayKey: 'key-a' })),
  });
  assert.equal(legacy?.slug, 'main');
});

test('getClientIp prefers x-forwarded-for then x-real-ip', () => {
  assert.equal(
    getClientIp({
      headers: new Headers({
        'x-forwarded-for': '203.0.113.10, 10.0.0.1',
        'x-real-ip': '198.51.100.20',
      }),
    }),
    '203.0.113.10',
  );
  assert.equal(
    getClientIp({ headers: new Headers({ 'x-real-ip': '198.51.100.20' }) }),
    '198.51.100.20',
  );
});
