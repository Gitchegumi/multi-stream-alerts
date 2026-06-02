import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  prisma,
  createInviteCode,
  listInviteCodes,
  revokeInviteCode,
} from '@multi-stream-alerts/database';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  role: z.enum(['admin', 'owner', 'editor', 'viewer']).optional(),
  maxUses: z.number().int().positive().max(1000).optional(),
  expiresAt: z.string().datetime().optional(),
  note: z.string().max(200).optional(),
});

const revokeSchema = z.object({
  id: z.string().min(1),
});

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  }
  if (session.user.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { userId: session.user.id };
}

export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const codes = await listInviteCodes();
  const redemptions = await prisma.inviteCodeRedemption.findMany({
    orderBy: { redeemedAt: 'desc' },
    take: 200,
    include: { user: { select: { email: true, displayName: true } } },
  });
  return NextResponse.json({ codes, redemptions });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid invite code payload', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  const code = await createInviteCode({
    createdByUserId: guard.userId,
    role: parsed.data.role,
    maxUses: parsed.data.maxUses,
    expiresAt,
    note: parsed.data.note,
  });
  return NextResponse.json({ code }, { status: 201 });
}

export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid revoke payload' }, { status: 400 });
  }

  const updated = await revokeInviteCode(parsed.data.id);
  if (!updated) {
    return NextResponse.json({ error: 'Invite code not found' }, { status: 404 });
  }
  return NextResponse.json({ code: updated });
}
