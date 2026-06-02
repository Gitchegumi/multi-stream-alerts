import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma, hashPassword, verifyPassword, redeemInviteCode, InviteCodeError } from "@multi-stream-alerts/database";
import type { UserRole } from "@multi-stream-alerts/database";

const MIN_PASSWORD_LENGTH = Math.max(
  8,
  Math.min(128, Number(process.env.PASSWORD_MIN_LENGTH ?? 12) || 12)
);
const DEFAULT_INVITEE_ROLE: UserRole = "owner";

// Complexity rule: each of the four character classes must appear at least once.
// This pairs with the length minimum to keep password strength reasonable
// while staying readable in error messages.
const PASSWORD_COMPLEXITY_HINT =
  "Password must include at least one uppercase letter, one lowercase letter, one digit, and one symbol";

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(128, "Password must be at most 128 characters")
  .refine((value) => /[A-Z]/.test(value), { message: PASSWORD_COMPLEXITY_HINT })
  .refine((value) => /[a-z]/.test(value), { message: PASSWORD_COMPLEXITY_HINT })
  .refine((value) => /[0-9]/.test(value), { message: PASSWORD_COMPLEXITY_HINT })
  .refine((value) => /[^A-Za-z0-9]/.test(value), { message: PASSWORD_COMPLEXITY_HINT });

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: passwordSchema,
    confirmPassword: z.string(),
    inviteCode: z.string().trim(),
    displayName: z.string().trim().min(1).max(80).optional()
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export type RegisterResult =
  | { ok: true; userId: string; channelId: string; role: UserRole }
  | { ok: false; code: "VALIDATION" | "EMAIL_TAKEN" | "INVITE_INVALID" | "INVITE_REVOKED" | "INVITE_EXPIRED" | "INVITE_EXHAUSTED" | "LOCAL_REGISTRATION_DISABLED"; message: string; field?: string };

/**
 * Registers a new local (email/password) user via invite code.
 *
 * On success, the user is provisioned with their own personal channel
 * (the user's "workspace") and is added as the channel's owner.
 */
export async function registerLocalUser(rawInput: unknown): Promise<RegisterResult> {
  if (process.env.ENABLE_LOCAL_REGISTRATION !== "true") {
    return { ok: false, code: "LOCAL_REGISTRATION_DISABLED", message: "Local registration is disabled" };
  }

  const parsed = registerSchema.safeParse(rawInput);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      code: "VALIDATION",
      message: first?.message ?? "Invalid registration input",
      field: first?.path[0]?.toString()
    };
  }

  const { email, password, inviteCode, displayName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, code: "EMAIL_TAKEN", message: "An account with that email already exists", field: "email" };
  }

  const passwordHash = await hashPassword(password);

  // Two-phase create: user first, then redeem + workspace. Wrap in a tx so
  // a redeem failure rolls back the user and we never leave an orphan.
  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          authProvider: "local",
          // Use a unique, stable value so the (authProvider, authSubject)
          // unique constraint still holds for local users. The cuid is
          // unique per row already; we re-use it for the subject.
          authSubject: "",
          email,
          displayName: displayName ?? email,
          passwordHash,
          role: DEFAULT_INVITEE_ROLE
        }
      });

      // Patch authSubject to the user's own id. The (provider, subject)
      // compound remains unique because cuid ids never collide.
      await tx.user.update({
        where: { id: user.id },
        data: { authSubject: user.id }
      });

      return user;
    });

    // Redeem invite (outside the create-tx so the InviteCodeError types flow).
    let redeemedRole: UserRole = DEFAULT_INVITEE_ROLE;
    try {
      const redeemed = await redeemInviteCode({ code: inviteCode, userId: result.id });
      redeemedRole = redeemed.role;
    } catch (error) {
      if (error instanceof InviteCodeError) {
        // Roll back the user we just created; otherwise they'd have an account
        // but no invite redemption, which is confusing.
        await prisma.user.delete({ where: { id: result.id } }).catch(() => undefined);
        return mapInviteError(error);
      }
      throw error;
    }

    // If the invite specified a role override, apply it now.
    if (redeemedRole !== DEFAULT_INVITEE_ROLE) {
      await prisma.user.update({ where: { id: result.id }, data: { role: redeemedRole } });
    }

    // Provision a personal channel for the new user.
    const channel = await prisma.channel.create({
      data: {
        name: displayName ?? email.split("@")[0] ?? "My Channel",
        slug: await generateUniqueChannelSlug(email),
        ownerUserId: result.id
      }
    });

    await prisma.channelMembership.create({
      data: {
        channelId: channel.id,
        userId: result.id,
        role: "owner"
      }
    });

    return { ok: true, userId: result.id, channelId: channel.id, role: redeemedRole };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, code: "EMAIL_TAKEN", message: "An account with that email already exists", field: "email" };
    }
    throw error;
  }
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1)
});

export type LoginResult =
  | { ok: true; userId: string; email: string; role: UserRole; displayName: string | null }
  | { ok: false; code: "VALIDATION" | "INVALID_CREDENTIALS"; message: string };

/**
 * Verifies a local user's email/password. Returns the user record on success
 * or a generic failure on bad credentials (we never disclose whether the
 * email exists).
 */
export async function authenticateLocalUser(rawInput: unknown): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: "Email and password are required" };
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.authProvider !== "local" || !user.passwordHash) {
    // Run a dummy hash compare to keep timing similar.
    await verifyPassword(password, "$2a$12$abcdefghijklmnopqrstuv");
    return { ok: false, code: "INVALID_CREDENTIALS", message: "Invalid email or password" };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return { ok: false, code: "INVALID_CREDENTIALS", message: "Invalid email or password" };
  }

  return {
    ok: true,
    userId: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName
  };
}

function mapInviteError(error: InviteCodeError): RegisterResult {
  switch (error.code) {
    case "REVOKED":
      return { ok: false, code: "INVITE_REVOKED", message: error.message, field: "inviteCode" };
    case "EXPIRED":
      return { ok: false, code: "INVITE_EXPIRED", message: error.message, field: "inviteCode" };
    case "EXHAUSTED":
      return { ok: false, code: "INVITE_EXHAUSTED", message: error.message, field: "inviteCode" };
    case "INVALID":
    default:
      return { ok: false, code: "INVITE_INVALID", message: error.message, field: "inviteCode" };
  }
}

async function generateUniqueChannelSlug(email: string): Promise<string> {
  const base = email
    .split("@")[0]
    ?.toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "user";
  const candidate = `${base}-${randomBytes(2).toString("hex")}`;
  const existing = await prisma.channel.findUnique({ where: { slug: candidate } });
  if (existing) {
    return `${candidate}-${randomBytes(2).toString("hex")}`;
  }
  return candidate;
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002"
  );
}
