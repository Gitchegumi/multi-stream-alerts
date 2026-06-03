CREATE TYPE "AssetSourceType" AS ENUM ('local', 's3', 'external_url');
CREATE TYPE "AssetType" AS ENUM ('image', 'video', 'audio');

ALTER TABLE "workspace_alert_layouts"
  ADD COLUMN "visual_asset_id" TEXT,
  ADD COLUMN "sound_asset_id" TEXT;

CREATE TABLE "workspace_assets" (
  "id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "owner_user_id" TEXT,
  "source_type" "AssetSourceType" NOT NULL,
  "asset_type" "AssetType" NOT NULL,
  "original_filename" TEXT,
  "stored_filename" TEXT,
  "storage_key" TEXT,
  "external_url" TEXT,
  "mime_type" TEXT NOT NULL,
  "file_size_bytes" BIGINT,
  "duration_seconds" INTEGER,
  "storage_provider" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_storage_settings" (
  "id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "quota_bytes" BIGINT NOT NULL DEFAULT 536870912,
  "max_file_size_bytes" BIGINT NOT NULL DEFAULT 52428800,
  "allowed_mime_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "server_uploads_enabled" BOOLEAN NOT NULL DEFAULT true,
  "non_admin_server_uploads_enabled" BOOLEAN NOT NULL DEFAULT true,
  "external_urls_enabled" BOOLEAN NOT NULL DEFAULT true,
  "s3_enabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_storage_settings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workspace_alert_layouts_visual_asset_id_idx" ON "workspace_alert_layouts"("visual_asset_id");
CREATE INDEX "workspace_alert_layouts_sound_asset_id_idx" ON "workspace_alert_layouts"("sound_asset_id");
CREATE INDEX "workspace_assets_channel_id_asset_type_idx" ON "workspace_assets"("channel_id", "asset_type");
CREATE INDEX "workspace_assets_channel_id_created_at_idx" ON "workspace_assets"("channel_id", "created_at");
CREATE UNIQUE INDEX "workspace_storage_settings_channel_id_key" ON "workspace_storage_settings"("channel_id");

ALTER TABLE "workspace_alert_layouts"
  ADD CONSTRAINT "workspace_alert_layouts_visual_asset_id_fkey"
  FOREIGN KEY ("visual_asset_id") REFERENCES "workspace_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workspace_alert_layouts"
  ADD CONSTRAINT "workspace_alert_layouts_sound_asset_id_fkey"
  FOREIGN KEY ("sound_asset_id") REFERENCES "workspace_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workspace_assets"
  ADD CONSTRAINT "workspace_assets_channel_id_fkey"
  FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_assets"
  ADD CONSTRAINT "workspace_assets_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workspace_storage_settings"
  ADD CONSTRAINT "workspace_storage_settings_channel_id_fkey"
  FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
