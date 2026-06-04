import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  prisma,
  createInviteCode,
  listInviteCodes,
  purgeRevokedInviteCode,
  purgeRevokedInviteCodes,
  revokeInviteCode,
} from '@multi-stream-alerts/database';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export type HandlerDeps = {
  revokeInviteCode: typeof revokeInviteCode;
  purgeRevokedInviteCode: typeof purgeRevokedInviteCode;
  purgeRevokedInviteCodes: typeof purgeRevokedInviteCodes;
};

const defaultDeps: HandlerDeps = {
  revokeInviteCode,
  purgeRevokedInviteCode,
  purgeRevokedInviteCodes,
};

const createSchema = z.object({
  role: z.enum(['admin', 'owner', 'editor', 'viewer']).optional(),
  maxUses: z.number().int().positive().max(1000).optional(),
  expiresAt: z.string().datetime().optional(),
  note: z.string().max(200).optional(),
  identityProviderInvite: z
    .object({
      provider: z.string().trim().min(1).max(64),
      externalToken: z.string().trim().min(1).max(2048),
      enrollmentUrl: z.string().trim().url().optional(),
      expiresAt: z.string().datetime().optional(),
    })
    .optional(),
});

const deleteSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('revoke'),
    id: z.string().min(1),
  }),
  z.object({
    action: z.literal('purge_revoked'),
    id: z.string().min(1),
  }),
  z.object({
    action: z.literal('purge_all_revoked'),
  }),
]);

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
  const identityProviderInvite = parsed.data.identityProviderInvite
    ? {
        provider: parsed.data.identityProviderInvite.provider.toLowerCase(),
        externalToken: parsed.data.identityProviderInvite.externalToken,
        enrollmentUrl: parsed.data.identityProviderInvite.enrollmentUrl ?? null,
        expiresAt: parsed.data.identityProviderInvite.expiresAt
          ? new Date(parsed.data.identityProviderInvite.expiresAt)
          : null,
      }
    : null;
  const code = await createInviteCode({
    createdByUserId: guard.userId,
    role: parsed.data.role,
    maxUses: parsed.data.maxUses,
    expiresAt,
    note: parsed.data.note,
    identityProviderInvite,
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

  const result = await handleDelete({ rawBody: body });
  return NextResponse.json(result.body, { status: result.status });
}

export async function handleDelete({
  rawBody,
  deps = defaultDeps,
}: {
  rawBody: unknown;
  deps?: HandlerDeps;
}): Promise<{ status: number; body: unknown }> {
  const parsed = deleteSchema.safeParse({
    action: 'revoke',
    ...(rawBody as Record<string, unknown>),
  });
  if (!parsed.success) {
    return { status: 400, body: { error: 'Invalid invite delete payload' } };
  }

  if (parsed.data.action === 'purge_all_revoked') {
    const deletedCount = await deps.purgeRevokedInviteCodes();
    return { status: 200, body: { deletedCount } };
  }

  if (parsed.data.action === 'purge_revoked') {
    const deletedCount = await deps.purgeRevokedInviteCode(parsed.data.id);
    if (deletedCount === 0) {
      return { status: 404, body: { error: 'Revoked invite code not found' } };
    }
    return { status: 200, body: { deletedCount } };
  }

  const updated = await deps.revokeInviteCode(parsed.data.id);
  if (!updated) {
    return { status: 404, body: { error: 'Invite code not found' } };
  }
  return { status: 200, body: { code: updated } };
}
