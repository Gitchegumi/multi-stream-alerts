CREATE TYPE "UserRole" AS ENUM ('admin', 'owner', 'editor', 'viewer');
CREATE TYPE "AlertPlatform" AS ENUM ('kofi', 'twitch', 'youtube', 'tiktok', 'manual');
CREATE TYPE "AlertType" AS ENUM ('tip', 'follow', 'subscription', 'resubscription', 'membership', 'superchat', 'supersticker', 'raid', 'cheer', 'gift', 'shop_order', 'commission', 'channel_point', 'stream_online', 'stream_offline', 'test');

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "auth_provider" TEXT NOT NULL,
  "auth_subject" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "display_name" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'viewer',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "channels" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "owner_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "channel_memberships" (
  "id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "channel_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alert_events" (
  "id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "platform" "AlertPlatform" NOT NULL,
  "type" "AlertType" NOT NULL,
  "display_name" TEXT NOT NULL,
  "amount" DECIMAL(12,2),
  "currency" TEXT,
  "message" TEXT,
  "is_public" BOOLEAN,
  "tier" TEXT,
  "quantity" INTEGER,
  "raw_event_id" TEXT NOT NULL,
  "raw_payload_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alert_templates" (
  "id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "platform" "AlertPlatform" NOT NULL,
  "type" "AlertType" NOT NULL,
  "name" TEXT NOT NULL,
  "template_json" JSONB NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "alert_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "overlay_profiles" (
  "id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "display_key" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "settings_json" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "overlay_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integration_settings" (
  "id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "settings_json" JSONB NOT NULL DEFAULT '{}',
  "is_enabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "integration_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deduplication_keys" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "raw_event_id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deduplication_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_auth_provider_auth_subject_key" ON "users"("auth_provider", "auth_subject");
CREATE UNIQUE INDEX "channels_slug_key" ON "channels"("slug");
CREATE UNIQUE INDEX "channel_memberships_channel_id_user_id_key" ON "channel_memberships"("channel_id", "user_id");
CREATE INDEX "alert_events_channel_id_created_at_idx" ON "alert_events"("channel_id", "created_at");
CREATE INDEX "alert_events_platform_raw_event_id_idx" ON "alert_events"("platform", "raw_event_id");
CREATE UNIQUE INDEX "alert_templates_channel_id_platform_type_name_key" ON "alert_templates"("channel_id", "platform", "type", "name");
CREATE UNIQUE INDEX "overlay_profiles_display_key_key" ON "overlay_profiles"("display_key");
CREATE UNIQUE INDEX "overlay_profiles_channel_id_slug_key" ON "overlay_profiles"("channel_id", "slug");
CREATE UNIQUE INDEX "integration_settings_channel_id_provider_key" ON "integration_settings"("channel_id", "provider");
CREATE UNIQUE INDEX "deduplication_keys_provider_raw_event_id_channel_id_key" ON "deduplication_keys"("provider", "raw_event_id", "channel_id");

ALTER TABLE "channels" ADD CONSTRAINT "channels_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "channel_memberships" ADD CONSTRAINT "channel_memberships_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "channel_memberships" ADD CONSTRAINT "channel_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alert_templates" ADD CONSTRAINT "alert_templates_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "overlay_profiles" ADD CONSTRAINT "overlay_profiles_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_settings" ADD CONSTRAINT "integration_settings_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deduplication_keys" ADD CONSTRAINT "deduplication_keys_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
