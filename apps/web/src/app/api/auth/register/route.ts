import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  prisma,
  assertInviteIsUsable,
  redeemInviteCodeInTransaction,
  InviteCodeError,
  hashPassword,
  type Prisma,
} from '@multi-stream-alerts/database';
import { createChannelWithUniqueSlug } from '@/lib/channel-slug';

export const dynamic = 'force-dynamic';

const credentialsEnabled = process.env.AUTH_CREDENTIALS_ENABLED === 'true';

const rateLimitWindowMs = 60_000;
const maxAttemptsPerWindow = 10;
const registerRateLimits = new Map<string, { count: number; resetAt: number }>();

const schema = z.object({
  inviteCode: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
});

export type HandlerDeps = {
  prisma: {
    user: {
      findUnique: (args: { where: { email: string } }) => Promise<{
        id: string;
        email: string;
      } | null>;
    };
    localCredential: {
      create: (args: {
        data: { userId: string; passwordHash: string };
      }) => Promise<{ id: string }>;
    };
    $transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
  };
  createChannelWithUniqueSlug: typeof createChannelWithUniqueSlug;
  hashPassword: typeof hashPassword;
  redeemInviteCodeInTransaction: typeof redeemInviteCodeInTransaction;
  assertInviteIsUsable: typeof assertInviteIsUsable;
};

const defaultDeps: HandlerDeps = {
  prisma,
  createChannelWithUniqueSlug,
  hashPassword,
  redeemInviteCodeInTransaction,
  assertInviteIsUsable,
};

type InviteCodeRow = {
  id: string;
  code: string;
  role: 'admin' | 'owner' | 'editor' | 'viewer';
  maxUses: number;
  usedCount: number;
  isRevoked: boolean;
  expiresAt: Date | null;
  note: string | null;
  createdByUserId: string;
  createdAt: Date;
};

// @ts-ignore
export async function handleRegister(
  request: Request,
  deps: HandlerDeps = defaultDeps,
): Promise<NextResponse> {
  if (!credentialsEnabled) {
    return NextResponse.json(
      { ok: false, error: 'Local credentials registration is disabled.' },
      { status: 403 },
    );
  }

  const clientIp = getClientIp(request);
  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      { ok: false, error: 'Too many signup attempts, try again shortly' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { ok: false, error: first?.message ?? 'Invalid request' },
      { status: 400 },
    );
  }

  const { inviteCode, email, password } = parsed.data;

  const existingUser = await deps.prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json(
      { ok: false, error: 'An account with this email already exists.' },
      { status: 409 },
    );
  }

  try {
    await deps.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const invite = await tx.inviteCode.findUnique({
        where: { code: inviteCode.toUpperCase().replace(/[^A-Z0-9-]/g, '') },
      });
      if (!invite) {
        throw new InviteCodeError('INVALID', 'Invite code not found');
      }
      deps.assertInviteIsUsable(invite as InviteCodeRow);

      const user = await tx.user.create({
        data: {
          authProvider: 'credentials',
          authSubject: email,
          email,
          displayName: email.split('@')[0] ?? 'User',
          role: 'viewer',
        },
      });

      await tx.localCredential.create({
        data: {
          userId: user.id,
          passwordHash: deps.hashPassword(password),
        },
      });

      const redeemed = await deps.redeemInviteCodeInTransaction(tx, {
        invite: invite as InviteCodeRow,
        userId: user.id,
      });

      if (redeemed.role !== 'viewer') {
        await tx.user.update({ where: { id: user.id }, data: { role: redeemed.role } });
      }

      const channel = await deps.createChannelWithUniqueSlug(
        tx,
        email.split('@')[0] ?? 'My Channel',
        email,
        user.id,
      );

      await tx.channelMembership.create({
        data: { channelId: channel.id, userId: user.id, role: 'owner' },
      });
    });
  } catch (error) {
    if (error instanceof InviteCodeError) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or expired invite code.' },
        { status: 400 },
      );
    }
    // Unique constraint on localCredential.userId or race creating user
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json(
        { ok: false, error: 'An account with this email already exists.' },
        { status: 409 },
      );
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  return handleRegister(request, defaultDeps);
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor || request.headers.get('x-real-ip') || 'unknown';
}

function isRateLimited(clientIp: string): boolean {
  const now = Date.now();
  const existing = registerRateLimits.get(clientIp);

  if (!existing || existing.resetAt <= now) {
    registerRateLimits.set(clientIp, { count: 1, resetAt: now + rateLimitWindowMs });
    cleanupExpiredRateLimits(now);
    return false;
  }

  existing.count += 1;
  return existing.count > maxAttemptsPerWindow;
}

function cleanupExpiredRateLimits(now: number) {
  for (const [clientIp, limit] of registerRateLimits) {
    if (limit.resetAt <= now) {
      registerRateLimits.delete(clientIp);
    }
  }
}
