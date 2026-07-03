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
import { prisma } from '@multi-stream-alerts/database';

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

  const account = await prisma.linkedAccount.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const updated = await prisma.linkedAccount.update({
    where: { id },
    data: { isActive: false, isPrimary: false },
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

  return NextResponse.json({ account: updated });
}