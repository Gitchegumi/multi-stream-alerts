-- Track which linked provider account owns each remote subscription so
-- disconnecting one Twitch broadcaster never tears down subscriptions for
-- the other broadcasters in the workspace. Existing rows remain nullable
-- because older single-account subscriptions cannot be backfilled safely.

ALTER TABLE "provider_subscriptions"
  ADD COLUMN "provider_account_id" TEXT;

-- Before multi-channel linking, a workspace could have only one active Twitch
-- account. That makes its existing EventSub rows safe to associate. Leave rows
-- nullable when no unique active account exists rather than guessing.
UPDATE "provider_subscriptions" AS "subscription"
SET "provider_account_id" = "account"."platform_account_id"
FROM (
  SELECT "channel_id", MIN("platform_account_id") AS "platform_account_id"
  FROM "linked_accounts"
  WHERE "platform" = 'twitch' AND "is_active" = TRUE AND "channel_id" IS NOT NULL
  GROUP BY "channel_id"
  HAVING COUNT(*) = 1
) AS "account"
WHERE "subscription"."provider" = 'twitch'
  AND "subscription"."channel_id" = "account"."channel_id";

CREATE INDEX "provider_subscriptions_channel_provider_account_idx"
  ON "provider_subscriptions"("channel_id", "provider", "provider_account_id");
