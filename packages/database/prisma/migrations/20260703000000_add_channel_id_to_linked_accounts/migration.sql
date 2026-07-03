-- Add channelId to linked_accounts so OAuth-linked Twitch/YouTube
-- accounts are scoped to a specific workspace/channel rather than
-- only to the user. Existing rows get NULL (user-level, pre-migration);
-- new OAuth links will carry the channelId from the linking flow.

ALTER TABLE "linked_accounts"
  ADD COLUMN "channel_id" TEXT;

CREATE INDEX "linked_accounts_channel_id_platform_idx"
  ON "linked_accounts"("channel_id", "platform");

ALTER TABLE "linked_accounts"
  ADD CONSTRAINT "linked_accounts_channel_id_fkey"
  FOREIGN KEY ("channel_id") REFERENCES "channels"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;