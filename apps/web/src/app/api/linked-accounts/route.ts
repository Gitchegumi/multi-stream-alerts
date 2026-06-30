/**
 * API routes for managing linked OAuth accounts.
 *
 * GET  /api/linked-accounts — list current user's linked accounts
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
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accounts = await prisma.linkedAccount.findMany({
    where: { userId: session.user.id, isActive: true },
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
      isActive: true,
      isPrimary: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ account: updated });
}
