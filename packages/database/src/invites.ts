import { randomBytes } from 'node:crypto';
import type { Prisma, UserRole } from '@prisma/client';
import { prisma } from './client';

const DEFAULT_CODE_LENGTH = 16;
// Skip lookalikes: 0/O, 1/I/L.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.replace(/[0O1IL]/g, '');

export type InviteCodeSummary = {
  id: string;
  code: string;
  role: UserRole;
  maxUses: number;
  usedCount: number;
  expiresAt: Date | null;
  isRevoked: boolean;
  note: string | null;
  createdByUserId: string;
  createdAt: Date;
  identityProviderInvite: IdentityProviderInviteSummary | null;
};

export type IdentityProviderInviteInput = {
  provider: string;
  externalToken: string;
  enrollmentUrl?: string | null;
  expiresAt?: Date | null;
};

export type IdentityProviderInviteSummary = {
  id: string;
  provider: string;
  enrollmentUrl: string | null;
  expiresAt: Date | null;
  usedAt: Date | null;
  createdAt: Date;
};

export class InviteCodeError extends Error {
  readonly code: 'INVALID' | 'EXPIRED' | 'REVOKED' | 'EXHAUSTED';
  constructor(code: InviteCodeError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'InviteCodeError';
  }
}

export function generateInviteCode(length: number = DEFAULT_CODE_LENGTH): string {
  const safeLength = Math.max(8, Math.min(48, Math.floor(length)));
  const bytes = randomBytes(safeLength);
  let out = '';
  for (let i = 0; i < safeLength; i++) {
    const byte = bytes[i] ?? 0;
    const char = ALPHABET[byte % ALPHABET.length];
    if (!char) continue;
    out += char;
    if (i > 0 && i < safeLength - 1 && (i + 1) % 4 === 0) {
      out += '-';
    }
  }
  return out;
}

export async function createInviteCode(input: {
  createdByUserId: string;
  role?: UserRole;
  maxUses?: number;
  expiresAt?: Date | null;
  note?: string | null;
  identityProviderInvite?: IdentityProviderInviteInput | null;
}): Promise<InviteCodeSummary> {
  const code = generateInviteCode();
  const created = await prisma.inviteCode.create({
    data: buildInviteCodeCreateData(input, code),
    include: { identityProviderInvite: true },
  });
  return toSummary(created);
}

export function buildInviteCodeCreateData(
  input: {
    createdByUserId: string;
    role?: UserRole;
    maxUses?: number;
    expiresAt?: Date | null;
    note?: string | null;
    identityProviderInvite?: IdentityProviderInviteInput | null;
  },
  code: string,
): Prisma.InviteCodeCreateInput {
  const maxUses = Math.max(1, Math.floor(input.maxUses ?? 1));
  return {
    code,
    role: input.role ?? 'owner',
    maxUses,
    expiresAt: input.expiresAt ?? null,
    note: input.note ?? null,
    createdBy: { connect: { id: input.createdByUserId } },
    identityProviderInvite: input.identityProviderInvite
      ? {
          create: {
            provider: input.identityProviderInvite.provider,
            externalToken: input.identityProviderInvite.externalToken,
            enrollmentUrl: input.identityProviderInvite.enrollmentUrl ?? null,
            expiresAt: input.identityProviderInvite.expiresAt ?? null,
          },
        }
      : undefined,
  };
}

export async function listInviteCodes(createdByUserId?: string): Promise<InviteCodeSummary[]> {
  const rows = await prisma.inviteCode.findMany({
    where: createdByUserId ? { createdByUserId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { identityProviderInvite: true },
  });
  return rows.map(toSummary);
}

export async function revokeInviteCode(id: string): Promise<InviteCodeSummary | null> {
  const updated = await prisma.inviteCode.update({
    where: { id },
    data: { isRevoked: true },
    include: { identityProviderInvite: true },
  });
  return toSummary(updated);
}

export async function findInviteByCode(rawCode: string) {
  if (!rawCode) return null;
  const normalized = rawCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
  if (!normalized) return null;
  return prisma.inviteCode.findUnique({ where: { code: normalized } });
}

export function assertInviteIsUsable(invite: {
  isRevoked: boolean;
  usedCount: number;
  maxUses: number;
  expiresAt: Date | null;
}): void {
  if (invite.isRevoked) {
    throw new InviteCodeError('REVOKED', 'This invite code has been revoked');
  }
  if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
    throw new InviteCodeError('EXPIRED', 'This invite code has expired');
  }
  if (invite.usedCount >= invite.maxUses) {
    throw new InviteCodeError('EXHAUSTED', 'This invite code has already been used');
  }
}

/**
 * Atomically increment usedCount, write a redemption row, and return the
 * resulting code + role. Throws InviteCodeError on race-condition loss or
 * invalidation after fetch.
 */
export async function redeemInviteCode(input: { code: string; userId: string }): Promise<{
  invite: InviteCodeSummary;
  role: UserRole;
}> {
  const invite = await findInviteByCode(input.code);
  if (!invite) {
    throw new InviteCodeError('INVALID', 'Invite code not found');
  }

  // Pre-flight validation (also re-runs inside the transaction).
  assertInviteIsUsable(invite);

  // The unique on (inviteCodeId, userId) guarantees a single user cannot
  // redeem the same code twice even with concurrent requests.
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const fresh = await tx.inviteCode.findUnique({ where: { id: invite.id } });
      if (!fresh) {
        throw new InviteCodeError('INVALID', 'Invite code not found');
      }
      assertInviteIsUsable(fresh);

      const updated = await tx.inviteCode.update({
        where: { id: fresh.id, usedCount: fresh.usedCount },
        data: { usedCount: { increment: 1 } },
      });

      await tx.inviteCodeRedemption.create({
        data: { inviteCodeId: fresh.id, userId: input.userId },
      });

      return updated;
    });

    return { invite: toSummary(result), role: result.role };
  } catch (error) {
    if (error instanceof InviteCodeError) {
      throw error;
    }
    if (isUniqueConstraintError(error)) {
      throw new InviteCodeError(
        'EXHAUSTED',
        'This invite code has already been used by this account',
      );
    }
    if (isOptimisticLockError(error)) {
      throw new InviteCodeError('EXHAUSTED', 'This invite code is no longer available');
    }
    throw error;
  }
}

/**
 * In-transaction variant of `redeemInviteCode`. Runs the same atomic
 * `usedCount` increment + redemption-row create on the supplied
 * Prisma transaction client so the caller can compose the redemption
 * into a larger atomic write (e.g. provisioning a new user + personal
 * channel in a single transaction).
 *
 * The caller is responsible for finding the invite row (which gives it
 * the chance to do its own pre-flight checks in the same transaction)
 * and for surfacing `InviteCodeError` failures to its own caller. The
 * variant does NOT wrap the operations in `prisma.$transaction` — that
 * is the caller's job.
 */
export async function redeemInviteCodeInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    invite: {
      id: string;
      usedCount: number;
      maxUses: number;
      isRevoked: boolean;
      expiresAt: Date | null;
      role: UserRole;
    };
    userId: string;
  },
): Promise<{ invite: InviteCodeSummary; role: UserRole }> {
  try {
    // Re-fetch the invite inside the caller's transaction so we see the
    // same row version the rest of the transaction will write against.
    // This handles the case where the invite was revoked or exhausted
    // between the caller's pre-flight and the actual write.
    const fresh = await tx.inviteCode.findUnique({ where: { id: input.invite.id } });
    if (!fresh) {
      throw new InviteCodeError('INVALID', 'Invite code not found');
    }
    assertInviteIsUsable(fresh);

    const updated = await tx.inviteCode.update({
      where: { id: fresh.id, usedCount: fresh.usedCount },
      data: { usedCount: { increment: 1 } },
    });

    await tx.inviteCodeRedemption.create({
      data: { inviteCodeId: fresh.id, userId: input.userId },
    });

    return { invite: toSummary(updated), role: updated.role };
  } catch (error) {
    if (error instanceof InviteCodeError) {
      throw error;
    }
    if (isUniqueConstraintError(error)) {
      throw new InviteCodeError(
        'EXHAUSTED',
        'This invite code has already been used by this account',
      );
    }
    if (isOptimisticLockError(error)) {
      throw new InviteCodeError('EXHAUSTED', 'This invite code is no longer available');
    }
    throw error;
  }
}

function toSummary(row: {
  id: string;
  code: string;
  role: UserRole;
  maxUses: number;
  usedCount: number;
  expiresAt: Date | null;
  isRevoked: boolean;
  note: string | null;
  createdByUserId: string;
  createdAt: Date;
  identityProviderInvite?: {
    id: string;
    provider: string;
    enrollmentUrl: string | null;
    expiresAt: Date | null;
    usedAt: Date | null;
    createdAt: Date;
  } | null;
}): InviteCodeSummary {
  return {
    id: row.id,
    code: row.code,
    role: row.role,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    expiresAt: row.expiresAt,
    isRevoked: row.isRevoked,
    note: row.note,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    identityProviderInvite: sanitizeIdentityProviderInviteForSummary(row.identityProviderInvite),
  };
}

export function sanitizeIdentityProviderInviteForSummary(
  row:
    | {
        id: string;
        provider: string;
        enrollmentUrl: string | null;
        expiresAt: Date | null;
        usedAt: Date | null;
        createdAt: Date;
      }
    | null
    | undefined,
): IdentityProviderInviteSummary | null {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    provider: row.provider,
    enrollmentUrl: row.enrollmentUrl,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    createdAt: row.createdAt,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002',
  );
}

function isOptimisticLockError(error: unknown): boolean {
  // Prisma surfaces an "A record was modified since you read it" error as
  // an exception without a stable code; guard by message substring.
  const message = error instanceof Error ? error.message : String(error);
  return /Record was modified since you read it|optimistic/i.test(message);
}
