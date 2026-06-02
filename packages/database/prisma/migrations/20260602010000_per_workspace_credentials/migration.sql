-- Drop the legacy generic-settings table. Pre-launch; no production rows.
DROP TABLE IF EXISTS integration_settings;

-- Per-workspace provider credentials, with explicit columns for the
-- public fields (e.g. twitchBroadcasterId) so the UI can read status
-- without decrypting.
CREATE TABLE integration_credentials (
  id                    TEXT PRIMARY KEY,
  channel_id            TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL,
  is_enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  twitch_broadcaster_id TEXT,
  created_at            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP(3) NOT NULL,
  CONSTRAINT integration_credentials_channel_id_provider_key UNIQUE (channel_id, provider)
);
CREATE INDEX integration_credentials_provider_idx ON integration_credentials (provider);

-- Encrypted per-credential secret values. The ciphertext column holds
-- the output of secrets.encryptSecret (dot-separated base64 triple) or
-- the empty string when the value has been cleared.
CREATE TABLE integration_credential_secrets (
  id            TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL REFERENCES integration_credentials(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  ciphertext    TEXT NOT NULL,
  created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP(3) NOT NULL,
  CONSTRAINT integration_credential_secrets_credential_id_key_key UNIQUE (credential_id, key)
);
CREATE INDEX integration_credential_secrets_key_idx ON integration_credential_secrets (key);
