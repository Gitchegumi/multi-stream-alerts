-- Migration: multi-user-signup
-- Adds passwordHash to users and the invite_codes / invite_code_redemptions tables.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;

-- CreateTable
CREATE TABLE "invite_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'owner',
    "max_uses" INTEGER NOT NULL DEFAULT 1,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_code_redemptions" (
    "id" TEXT NOT NULL,
    "invite_code_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "redeemed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_code_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_code_key" ON "invite_codes"("code");

-- CreateIndex
CREATE INDEX "invite_codes_created_by_user_id_idx" ON "invite_codes"("created_by_user_id");

-- CreateIndex
CREATE INDEX "invite_codes_expires_at_idx" ON "invite_codes"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "invite_code_redemptions_invite_code_id_user_id_key" ON "invite_code_redemptions"("invite_code_id", "user_id");

-- CreateIndex
CREATE INDEX "invite_code_redemptions_user_id_idx" ON "invite_code_redemptions"("user_id");

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_code_redemptions" ADD CONSTRAINT "invite_code_redemptions_invite_code_id_fkey" FOREIGN KEY ("invite_code_id") REFERENCES "invite_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_code_redemptions" ADD CONSTRAINT "invite_code_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
