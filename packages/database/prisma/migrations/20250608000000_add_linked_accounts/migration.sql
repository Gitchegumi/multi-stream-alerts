-- AddLinkedAccountTable
CREATE TABLE "linked_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platform_account_id" TEXT NOT NULL,
    "platform_account_name" TEXT,
    "encrypted_access_token" TEXT NOT NULL,
    "encrypted_refresh_token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "linked_accounts_pkey" PRIMARY KEY ("id")
);

-- AddLinkedAccountUserIndex
CREATE INDEX "linked_accounts_user_id_platform_idx" ON "linked_accounts"("user_id", "platform");

-- AddLinkedAccountUniqueConstraint
CREATE UNIQUE INDEX "linked_accounts_user_id_platform_platform_account_id_key" ON "linked_accounts"("user_id", "platform", "platform_account_id");

-- AddLinkedAccountUserForeignKey
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
