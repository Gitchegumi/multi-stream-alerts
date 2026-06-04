ALTER TABLE "workspace_alert_layouts"
  ADD COLUMN "editor_layout" JSONB NOT NULL DEFAULT '{}';

UPDATE "workspace_alert_layouts"
SET "editor_layout" = "animation_settings"->'editorLayout'
WHERE jsonb_typeof("animation_settings"->'editorLayout') = 'object';
