-- OAuth auto-provisioning support (issue #128).
--
-- 1. Add youtube_channel_id public column to integration_credentials so
--    the backend can store the YouTube channel resolved from the linked
--    account's OAuth token (mirrors twitch_broadcaster_id).
-- 2. Add provider_subscriptions table to track the remote Twitch EventSub
--    and YouTube WebSub subscriptions we create on connect, so we can tear
--    them down on disconnect and renew YouTube leases before they expire.

ALTER TABLE "integration_credentials"
  ADD COLUMN "youtube_channel_id" TEXT;

CREATE TABLE "provider_subscriptions" (
  "id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_subscription_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'enabled',
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "provider_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_subscriptions_provider_subscription_id_key"
  ON "provider_subscriptions"("provider_subscription_id");

CREATE INDEX "provider_subscriptions_channel_id_provider_idx"
  ON "provider_subscriptions"("channel_id", "provider");

CREATE INDEX "provider_subscriptions_provider_expires_at_idx"
  ON "provider_subscriptions"("provider", "expires_at");

ALTER TABLE "provider_subscriptions"
  ADD CONSTRAINT "provider_subscriptions_channel_id_fkey"
  FOREIGN KEY ("channel_id") REFERENCES "channels"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
