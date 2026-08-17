/**
 * API routes for managing linked OAuth accounts.
 *
 * GET  /api/linked-accounts — list current user's linked accounts
 *   Optional ?channelSlug=<slug> filters to a specific workspace/channel
 * DELETE /api/linked-accounts — disconnect (soft-delete) an account
 *
 * @module api/linked-accounts
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  canManageChannelCredentials,
  prisma,
  teardownTwitchBroadcasterEventSub,
  teardownTwitchEventSub,
  teardownYoutubeWebSub,
} from '@multi-stream-alerts/database';
import { encrypt } from '@multi-stream-alerts/shared';

/**
 * GET — list all linked accounts for the authenticated user.
 * Returns safe fields only (no encrypted tokens).
 * When ?channelSlug is provided, filters to accounts scoped to that
 * channel (including accounts with channelId=null for backward compat
 * only when no channel-specific accounts exist).
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const channelSlug = searchParams.get('channelSlug');

  // If channelSlug is provided, resolve it to a channelId and filter
  let channelId: string | undefined;
  if (channelSlug) {
    const channel = await prisma.channel.findUnique({
      where: { slug: channelSlug },
      select: { id: true },
    });
    if (channel) {
      channelId = channel.id;
    }
  }

  const where = channelId
    ? { userId: session.user.id, isActive: true, channelId }
    : { userId: session.user.id, isActive: true };

  const accounts = await prisma.linkedAccount.findMany({
    where,
    select: {
      id: true,
      platform: true,
      platformAccountId: true,
      platformAccountName: true,
      channelId: true,
      isActive: true,
      isPrimary: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ platform: 'asc' }, { isPrimary: 'desc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json({ accounts });
}

/**
 * DELETE — soft-delete a linked account by ID.
 * Verifies ownership before deactivating.
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { id?: string };
  const { id } = body;

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Missing account id' }, { status: 400 });
  }

  const result = await handleDeleteLinkedAccount({
    id,
    session: { user: { id: session.user.id, role: session.user.role } },
  });
  return NextResponse.json(result.body, { status: result.status });
}

export type LinkedAccountHandlerSession = {
  user: { id: string; role: 'admin' | 'owner' | 'editor' | 'viewer' };
};

export type LinkedAccountHandlerDeps = {
  prisma: typeof prisma;
  canManageChannelCredentials: typeof canManageChannelCredentials;
  teardownTwitchBroadcasterEventSub: typeof teardownTwitchBroadcasterEventSub;
  teardownTwitchEventSub: typeof teardownTwitchEventSub;
  teardownYoutubeWebSub: typeof teardownYoutubeWebSub;
  encrypt: typeof encrypt;
};

const defaultHandlerDeps: LinkedAccountHandlerDeps = {
  prisma,
  canManageChannelCredentials,
  teardownTwitchBroadcasterEventSub,
  teardownTwitchEventSub,
  teardownYoutubeWebSub,
  encrypt,
};

/**
 * Disconnect a linked account after rechecking current workspace authority.
 * Twitch teardown happens before token removal and is scoped to the selected
 * broadcaster, so a failed provider call cannot strand the other channels.
 */
export async function handleDeleteLinkedAccount({
  id,
  session,
  deps = defaultHandlerDeps,
}: {
  id: string;
  session: LinkedAccountHandlerSession;
  deps?: LinkedAccountHandlerDeps;
}): Promise<{ status: number; body: unknown }> {
  const account = await deps.prisma.linkedAccount.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!account) {
    return { status: 404, body: { error: 'Account not found' } };
  }

  if (
    account.channelId &&
    !(await deps.canManageChannelCredentials(session.user.id, session.user.role, account.channelId))
  ) {
    return { status: 403, body: { error: 'Forbidden' } };
  }

  if (account.platform === 'twitch' && account.channelId) {
    try {
      await deps.teardownTwitchBroadcasterEventSub({
        channelId: account.channelId,
        broadcasterUserId: account.platformAccountId,
      });
    } catch (err) {
      console.error('[linked-accounts] Twitch broadcaster teardown failed', {
        channelId: account.channelId,
        reason: err instanceof Error ? err.message : 'unknown_error',
      });
      return {
        status: 502,
        body: { error: 'Twitch could not confirm subscription removal; try again' },
      };
    }
  }

  const updated = await deps.prisma.linkedAccount.update({
    where: { id },
    data: {
      isActive: false,
      isPrimary: false,
      // Disconnecting ends the OAuth grant's use in GitchAlerts. Remove the
      // locally stored token material while retaining non-secret metadata.
      encryptedAccessToken: deps.encrypt(''),
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
    },
    select: {
      id: true,
      platform: true,
      platformAccountId: true,
      platformAccountName: true,
      channelId: true,
      isActive: true,
      isPrimary: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await teardownProviderIfLastAccount(account.channelId, account.platform, deps).catch((err) => {
    console.error('[linked-accounts] provider teardown failed', {
      platform: account.platform,
      channelId: account.channelId,
      reason: err instanceof Error ? err.message : 'unknown_error',
    });
  });

  return { status: 200, body: { account: updated } };
}

/** Clear shared provider state only after the final account is inactive. */
async function teardownProviderIfLastAccount(
  channelId: string | null,
  platform: string,
  deps: LinkedAccountHandlerDeps,
): Promise<void> {
  if (!channelId) return;

  const remaining = await deps.prisma.linkedAccount.count({
    where: { channelId, platform, isActive: true },
  });
  if (platform === 'twitch') {
    if (remaining > 0) return;
    await deps.teardownTwitchEventSub({ channelId });
  } else if (platform === 'youtube') {
    if (remaining > 0) return;
    const channel = await deps.prisma.channel.findUnique({
      where: { id: channelId },
      select: { slug: true },
    });
    if (channel) {
      await deps.teardownYoutubeWebSub({ channelId, channelSlug: channel.slug });
    }
  }
}
