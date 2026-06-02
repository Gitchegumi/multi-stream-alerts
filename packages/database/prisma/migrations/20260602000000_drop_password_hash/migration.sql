-- Migration: drop-password-hash
-- Removes password_hash from users. Local email/password authentication is
-- replaced by OIDC-only sign-in; invite codes are redeemed on first OIDC login.

-- AlterTable
ALTER TABLE "users" DROP COLUMN "password_hash";
