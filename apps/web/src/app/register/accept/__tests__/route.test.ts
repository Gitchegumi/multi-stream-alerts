import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { handleInviteLink, type InviteLinkDeps } from '../route.ts';

function makeRequest(invite = 'ABCD-EFGH') {
  return new Request(`http://localhost/register/accept?invite=${encodeURIComponent(invite)}`);
}

function makeInvite(overrides: Partial<Awaited<ReturnType<InviteLinkDeps['findInvite']>>> = {}) {
  return {
    id: 'invite-1',
    code: 'ABCD-EFGH',
    usedCount: 0,
    maxUses: 1,
    isRevoked: false,
    expiresAt: null,
    identityProviderInvite: {
      provider: 'authentik',
      externalToken: 'secret-itoken',
      enrollmentUrl: 'https://idp.example.com/enroll?flow=default',
      expiresAt: null,
    },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<InviteLinkDeps> = {}): InviteLinkDeps {
  return {
    findInvite: mock.fn(async () => makeInvite()),
    assertInviteIsUsable: mock.fn(() => undefined),
    enrollmentConfig: {
      enabled: true,
      provider: 'authentik',
      enrollmentUrl: 'https://idp.example.com/fallback',
    },
    ...overrides,
  };
}

test('/register invite link sets invite cookie and redirects to Authentik enrollment', async () => {
  const response = await handleInviteLink(makeRequest(), makeDeps());

  assert.equal(response.status, 307);
  const location = response.headers.get('location');
  assert.ok(location);
  const url = new URL(location);
  assert.equal(url.origin, 'https://idp.example.com');
  assert.equal(url.pathname, '/enroll');
  assert.equal(url.searchParams.get('flow'), 'default');
  assert.equal(url.searchParams.get('itoken'), 'secret-itoken');
  assert.match(response.headers.get('set-cookie') ?? '', /ga_signup_invite=ABCD-EFGH/);
});

test('/register invite link does not redeem the invite before callback', async () => {
  const deps = makeDeps();

  await handleInviteLink(makeRequest(), deps);

  assert.equal((deps.findInvite as ReturnType<typeof mock.fn>).mock.callCount(), 1);
});

test('/register invite link returns useful error when enrollment metadata is missing', async () => {
  const response = await handleInviteLink(
    makeRequest(),
    makeDeps({
      findInvite: mock.fn(async () => makeInvite({ identityProviderInvite: null })),
    }),
  );

  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'http://localhost/register?error=missingEnrollment');
});

test('/register invite link can accept an invite without external enrollment mode', async () => {
  const response = await handleInviteLink(
    makeRequest(),
    makeDeps({
      enrollmentConfig: { enabled: false, provider: null, enrollmentUrl: null },
    }),
  );

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get('location'),
    'http://localhost/register?inviteReady=1&code=ABCD-EFGH',
  );
  assert.match(response.headers.get('set-cookie') ?? '', /ga_signup_invite=ABCD-EFGH/);
});
