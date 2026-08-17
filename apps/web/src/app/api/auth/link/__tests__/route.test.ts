import test from 'node:test';
import assert from 'node:assert/strict';
import { handleStartOAuthLink, type LinkHandlerDeps } from '../route.ts';

function makeDeps({ canManage = true }: { canManage?: boolean } = {}): LinkHandlerDeps {
  return {
    prisma: {
      channel: {
        findUnique: async () => ({ id: 'channel-1' }),
      },
      user: {
        findUnique: async () => ({ role: 'owner' }),
      },
    } as unknown as LinkHandlerDeps['prisma'],
    canManageChannelCredentials: async () => canManage,
    createLinkingToken: async () => 'signed-linking-token',
  };
}

test('handleStartOAuthLink rejects a user without credential-management authority', async () => {
  const result = await handleStartOAuthLink({
    provider: 'twitch',
    userId: 'editor-1',
    channelSlug: 'main',
    deps: makeDeps({ canManage: false }),
  });

  assert.equal(result.status, 403);
  assert.equal(result.linkingToken, undefined);
});

test('handleStartOAuthLink requires a workspace-scoped linking request', async () => {
  const result = await handleStartOAuthLink({
    provider: 'google',
    userId: 'owner-1',
    channelSlug: null,
    deps: makeDeps(),
  });

  assert.equal(result.status, 400);
  assert.equal(result.linkingToken, undefined);
});

test('handleStartOAuthLink issues state only after current permission succeeds', async () => {
  const result = await handleStartOAuthLink({
    provider: 'twitch',
    userId: 'owner-1',
    channelSlug: 'main',
    deps: makeDeps(),
  });

  assert.equal(result.status, 200);
  assert.equal(result.linkingToken, 'signed-linking-token');
});
