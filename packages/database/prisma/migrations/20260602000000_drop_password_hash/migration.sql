-- Migration: drop-password-hash
-- Removes password_hash from users. Local email/password authentication is
-- replaced by OIDC-only sign-in; invite codes are redeemed on first OIDC login.
--
-- WARNING: This migration irreversibly destroys any local email/password
-- accounts. If users were created against the PR #4 schema (local
-- credentials), they will no longer be able to authenticate once this
-- migration is applied. Migrate those users to OIDC (issue them an
-- invite code, sign them in once via the IdP) BEFORE applying this
-- migration. As of this PR there is no production data, but reviewers
-- should be aware that this is a one-way operation.

-- AlterTable
ALTER TABLE "users" DROP COLUMN "password_hash";
