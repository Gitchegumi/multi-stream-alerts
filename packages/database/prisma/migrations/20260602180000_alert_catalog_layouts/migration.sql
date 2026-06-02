ALTER TYPE "AlertPlatform" ADD VALUE IF NOT EXISTS 'generic';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'widget_event';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'external_purchase';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'hypechat';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'charity_donation';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'redemption';

ALTER TABLE "alert_events" ADD COLUMN "event_key" TEXT;
ALTER TABLE "alert_events" ADD COLUMN "layout_id" TEXT;
ALTER TABLE "alert_events" ADD COLUMN "layout_name" TEXT;
ALTER TABLE "alert_events" ADD COLUMN "layout_style" TEXT;
ALTER TABLE "alert_events" ADD COLUMN "duration_ms" INTEGER;
ALTER TABLE "alert_events" ADD COLUMN "volume" INTEGER;
ALTER TABLE "alert_events" ADD COLUMN "template_text" TEXT;
ALTER TABLE "alert_events" ADD COLUMN "visual_asset_url" TEXT;
ALTER TABLE "alert_events" ADD COLUMN "sound_asset_url" TEXT;

CREATE TABLE "alert_event_types" (
  "id" TEXT NOT NULL,
  "platform" "AlertPlatform" NOT NULL,
  "event_key" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "legacy_type" "AlertType" NOT NULL,
  "description" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "alert_event_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_alert_layouts" (
  "id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "style" TEXT NOT NULL DEFAULT 'vertical',
  "visual_asset_url" TEXT,
  "sound_asset_url" TEXT,
  "animation_settings" JSONB NOT NULL DEFAULT '{}',
  "default_duration_ms" INTEGER NOT NULL DEFAULT 6500,
  "default_volume" INTEGER NOT NULL DEFAULT 80,
  "is_system_preset" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_alert_layouts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_alert_configs" (
  "id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "alert_event_type_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "layout_id" TEXT,
  "display_name" TEXT,
  "template_text" TEXT,
  "duration_ms" INTEGER,
  "volume" INTEGER,
  "config_json" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_alert_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "alert_event_types_event_key_key" ON "alert_event_types"("event_key");
CREATE INDEX "alert_event_types_platform_sort_order_idx" ON "alert_event_types"("platform", "sort_order");
CREATE UNIQUE INDEX "workspace_alert_layouts_channel_id_name_key" ON "workspace_alert_layouts"("channel_id", "name");
CREATE INDEX "workspace_alert_layouts_channel_id_idx" ON "workspace_alert_layouts"("channel_id");
CREATE UNIQUE INDEX "workspace_alert_configs_channel_id_alert_event_type_id_key" ON "workspace_alert_configs"("channel_id", "alert_event_type_id");
CREATE INDEX "workspace_alert_configs_channel_id_enabled_idx" ON "workspace_alert_configs"("channel_id", "enabled");
CREATE INDEX "workspace_alert_configs_layout_id_idx" ON "workspace_alert_configs"("layout_id");
CREATE INDEX "alert_events_channel_id_event_key_idx" ON "alert_events"("channel_id", "event_key");

ALTER TABLE "workspace_alert_layouts" ADD CONSTRAINT "workspace_alert_layouts_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_alert_configs" ADD CONSTRAINT "workspace_alert_configs_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_alert_configs" ADD CONSTRAINT "workspace_alert_configs_alert_event_type_id_fkey" FOREIGN KEY ("alert_event_type_id") REFERENCES "alert_event_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_alert_configs" ADD CONSTRAINT "workspace_alert_configs_layout_id_fkey" FOREIGN KEY ("layout_id") REFERENCES "workspace_alert_layouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "alert_event_types" ("id", "platform", "event_key", "display_name", "legacy_type", "sort_order", "updated_at")
VALUES
  ('catalog_youtube_tipped', 'youtube', 'youtube.tipped', 'YouTube Tipped', 'tip', 10, CURRENT_TIMESTAMP),
  ('catalog_youtube_superchat', 'youtube', 'youtube.superchat', 'YouTube Sent Superchat', 'superchat', 20, CURRENT_TIMESTAMP),
  ('catalog_youtube_subscribed', 'youtube', 'youtube.subscribed', 'YouTube Subscribed', 'subscription', 30, CURRENT_TIMESTAMP),
  ('catalog_youtube_member', 'youtube', 'youtube.member', 'YouTube Became Member', 'membership', 40, CURRENT_TIMESTAMP),
  ('catalog_youtube_merch_purchased', 'youtube', 'youtube.merch_purchased', 'YouTube Merch Purchased', 'shop_order', 50, CURRENT_TIMESTAMP),
  ('catalog_youtube_widget_event', 'youtube', 'youtube.widget_event', 'YouTube Widget Event (SDK/API)', 'widget_event', 60, CURRENT_TIMESTAMP),
  ('catalog_twitch_followed', 'twitch', 'twitch.followed', 'Twitch Followed', 'follow', 110, CURRENT_TIMESTAMP),
  ('catalog_twitch_subscribed', 'twitch', 'twitch.subscribed', 'Twitch Subscribed', 'subscription', 120, CURRENT_TIMESTAMP),
  ('catalog_twitch_single_sub_gift', 'twitch', 'twitch.single_sub_gift', 'Twitch Single Sub Gift', 'gift', 130, CURRENT_TIMESTAMP),
  ('catalog_twitch_community_gift', 'twitch', 'twitch.community_gift', 'Twitch Community Gift', 'gift', 140, CURRENT_TIMESTAMP),
  ('catalog_twitch_cheered', 'twitch', 'twitch.cheered', 'Twitch Cheered', 'cheer', 150, CURRENT_TIMESTAMP),
  ('catalog_twitch_tipped', 'twitch', 'twitch.tipped', 'Twitch Tipped', 'tip', 160, CURRENT_TIMESTAMP),
  ('catalog_twitch_raided', 'twitch', 'twitch.raided', 'Twitch Raided', 'raid', 170, CURRENT_TIMESTAMP),
  ('catalog_twitch_external_purchase', 'twitch', 'twitch.external_purchase', 'Twitch External Purchase (API)', 'external_purchase', 180, CURRENT_TIMESTAMP),
  ('catalog_twitch_community_gifted_sub', 'twitch', 'twitch.community_gifted_sub', 'Twitch Community Gifted Sub', 'gift', 190, CURRENT_TIMESTAMP),
  ('catalog_twitch_hypechat', 'twitch', 'twitch.hypechat', 'Twitch Hypechat', 'hypechat', 200, CURRENT_TIMESTAMP),
  ('catalog_twitch_charity_donation', 'twitch', 'twitch.charity_donation', 'Twitch Charity Donation', 'charity_donation', 210, CURRENT_TIMESTAMP),
  ('catalog_twitch_merch_purchased', 'twitch', 'twitch.merch_purchased', 'Twitch Merch Purchased', 'shop_order', 220, CURRENT_TIMESTAMP),
  ('catalog_twitch_redemption', 'twitch', 'twitch.redemption', 'Twitch Redemption', 'redemption', 230, CURRENT_TIMESTAMP),
  ('catalog_twitch_widget_event', 'twitch', 'twitch.widget_event', 'Twitch Widget Event (SDK/API)', 'widget_event', 240, CURRENT_TIMESTAMP),
  ('catalog_kofi_tipped', 'kofi', 'kofi.tipped', 'Ko-fi Tipped', 'tip', 310, CURRENT_TIMESTAMP),
  ('catalog_kofi_subscribed', 'kofi', 'kofi.subscribed', 'Ko-fi Subscribed', 'subscription', 320, CURRENT_TIMESTAMP),
  ('catalog_kofi_commission', 'kofi', 'kofi.commission', 'Ko-fi Commission', 'commission', 330, CURRENT_TIMESTAMP),
  ('catalog_kofi_shop_order', 'kofi', 'kofi.shop_order', 'Ko-fi Shop Order', 'shop_order', 340, CURRENT_TIMESTAMP),
  ('catalog_generic_widget_event', 'generic', 'generic.widget_event', 'Generic Widget Event (SDK/API)', 'widget_event', 410, CURRENT_TIMESTAMP),
  ('catalog_manual_test', 'manual', 'manual.test', 'Manual Test Alert', 'test', 510, CURRENT_TIMESTAMP)
ON CONFLICT ("event_key") DO NOTHING;

INSERT INTO "workspace_alert_layouts" ("id", "channel_id", "name", "style", "default_duration_ms", "default_volume", "is_system_preset", "updated_at")
SELECT 'layout_vertical_' || "id", "id", 'Vertical', 'vertical', 6500, 80, true, CURRENT_TIMESTAMP FROM "channels"
ON CONFLICT ("channel_id", "name") DO NOTHING;

INSERT INTO "workspace_alert_layouts" ("id", "channel_id", "name", "style", "default_duration_ms", "default_volume", "is_system_preset", "updated_at")
SELECT 'layout_horizontal_' || "id", "id", 'Horizontal', 'horizontal', 6500, 80, true, CURRENT_TIMESTAMP FROM "channels"
ON CONFLICT ("channel_id", "name") DO NOTHING;

INSERT INTO "workspace_alert_configs" ("id", "channel_id", "alert_event_type_id", "enabled", "layout_id", "updated_at")
SELECT 'config_' || c."id" || '_' || et."id", c."id", et."id",
  CASE WHEN et."event_key" IN ('kofi.tipped', 'manual.test', 'generic.widget_event') THEN true ELSE false END,
  wl."id",
  CURRENT_TIMESTAMP
FROM "channels" c
CROSS JOIN "alert_event_types" et
LEFT JOIN "workspace_alert_layouts" wl ON wl."channel_id" = c."id" AND wl."name" = 'Vertical'
ON CONFLICT ("channel_id", "alert_event_type_id") DO NOTHING;
