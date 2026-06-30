/**
 * PATCH /api/linked-accounts/:id/primary
 * Set a YouTube-linked account as the primary channel.
 * Only YouTube accounts can be set as primary.
 *
 * @module api/linked-accounts/primary
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@multi-stream-alerts/database';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH — set the specified linked account as primary.
 * Validates ownership and ensures the account is a YouTube account.
 */
export async function PATCH(_request: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;

  const account = await prisma.linkedAccount.findFirst({
    where: { id, userId: session.user.id, isActive: true },
  });

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  if (account.platform !== 'youtube') {
    return NextResponse.json(
      { error: 'Only YouTube accounts can be set as primary' },
      { status: 400 },
    );
  }

  // Atomic: demote all other YouTube accounts, then promote this one
  const [, updated] = await prisma.$transaction([
    prisma.linkedAccount.updateMany({
      where: { userId: session.user.id, platform: 'youtube', isPrimary: true },
      data: { isPrimary: false },
    }),
    prisma.linkedAccount.update({
      where: { id },
      data: { isPrimary: true },
      select: {
        id: true,
        platform: true,
        platformAccountId: true,
        platformAccountName: true,
        isActive: true,
        isPrimary: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  return NextResponse.json({ account: updated });
}
