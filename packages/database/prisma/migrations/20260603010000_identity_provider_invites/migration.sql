-- Adds optional provider-neutral identity-provider enrollment metadata
-- linked 1-to-1 with a GitchAlerts invite code.

CREATE TABLE "identity_provider_invites" (
    "id" TEXT NOT NULL,
    "invite_code_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_token" TEXT NOT NULL,
    "enrollment_url" TEXT,
    "expires_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_provider_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "identity_provider_invites_invite_code_id_key" ON "identity_provider_invites"("invite_code_id");
CREATE INDEX "identity_provider_invites_provider_idx" ON "identity_provider_invites"("provider");
CREATE INDEX "identity_provider_invites_expires_at_idx" ON "identity_provider_invites"("expires_at");

ALTER TABLE "identity_provider_invites"
ADD CONSTRAINT "identity_provider_invites_invite_code_id_fkey"
FOREIGN KEY ("invite_code_id") REFERENCES "invite_codes"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
