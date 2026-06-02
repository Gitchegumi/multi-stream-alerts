"use client";

import { useState, useTransition } from "react";
import type { CredentialStatus, IntegrationProvider } from "@multi-stream-alerts/database";

type Props = {
  channelSlug: string;
  provider: IntegrationProvider;
  initialStatus: CredentialStatus;
  readOnly: boolean;
};

// Per-provider field list. Order matters — UI renders in this order.
//
// "Public" fields are non-secret values stored on the credential row's
// own columns (e.g. twitchBroadcasterId). They get sent through the
// same PUT body but are filtered out of the per-secret save loop on the
// server. They also render as type="text" instead of "password".
const FIELDS: Record<
  IntegrationProvider,
  { key: string; label: string; placeholder: string; minLength?: number; isPublic?: boolean; maxLength?: number }[]
> = {
  kofi: [
    { key: "verificationToken", label: "Verification token", placeholder: "Paste from Ko-fi", minLength: 1, maxLength: 256 }
  ],
  twitch: [
    { key: "eventsubSecret", label: "EventSub secret", placeholder: "16+ character secret", minLength: 16, maxLength: 256 },
    { key: "clientId", label: "Client ID", placeholder: "Twitch app client ID", minLength: 1, maxLength: 128 },
    { key: "clientSecret", label: "Client secret", placeholder: "Twitch app client secret", minLength: 1, maxLength: 256 },
    { key: "broadcasterId", label: "Broadcaster ID (public)", placeholder: "Numeric user ID", isPublic: true, maxLength: 32 }
  ],
  youtube: [
    { key: "clientId", label: "Client ID", placeholder: "Google OAuth client ID", minLength: 1, maxLength: 128 },
    { key: "clientSecret", label: "Client secret", placeholder: "Google OAuth client secret", minLength: 1, maxLength: 256 }
  ]
};

function labelFor(p: IntegrationProvider): string {
  if (p === "kofi") return "Ko-fi";
  if (p === "twitch") return "Twitch";
  return "YouTube";
}

export function IntegrationSettingsForm({ channelSlug, provider, initialStatus, readOnly }: Props) {
  // State: a map of "field key" -> "user-typed value". Empty string means
  // the user hasn't typed anything (and is omitted from PUT bodies).
  const [values, setValues] = useState<Record<string, string>>({});
  // The current status, used to render "Configured" / "Not configured"
  // badges. Updated on every successful save/clear by re-reading from
  // the API.
  const [status, setStatus] = useState<CredentialStatus>(initialStatus);
  const [saving, startSave] = useTransition();
  const [clearing, startClear] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Brief inline confirmation: "Saved." / "Cleared." — cleared on the
  // next user interaction.
  const [notice, setNotice] = useState<string | null>(null);

  const fields = FIELDS[provider];
  const baseUrl = `/api/channels/${encodeURIComponent(channelSlug)}/integrations/${provider}`;

  // Re-fetch the canonical status from the server. Used after every
  // mutation (save and clear) so the UI's "Configured" / "Not
  // configured" badges always reflect the DB's truth, not the client's
  // optimistic view.
  const refreshStatus = async () => {
    const res = await fetch(baseUrl, { method: "GET", cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as CredentialStatus;
    setStatus(data);
  };

  const save = () => {
    setError(null);
    setNotice(null);
    startSave(async () => {
      // Build the body: for each non-public field, include the value
      // if the user typed something. The public broadcasterId goes
      // through the same body but is filtered server-side.
      const body: Record<string, string> = {};
      for (const f of fields) {
        const v = values[f.key];
        if (v !== undefined && v !== "") body[f.key] = v;
      }
      const res = await fetch(baseUrl, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        setError(`Save failed: ${res.status}`);
        return;
      }
      const data = (await res.json()) as CredentialStatus;
      setStatus(data);
      setValues({});
      setNotice("Saved.");
    });
  };

  const clearField = (key: string) => {
    if (
      !confirm(
        "Clear this secret? You'll need to re-enter it to re-enable the integration."
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    startClear(async () => {
      const res = await fetch(baseUrl, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key })
      });
      if (!res.ok) {
        setError(`Clear failed: ${res.status}`);
        return;
      }
      await refreshStatus();
      setNotice("Cleared.");
    });
  };

  const clearAll = () => {
    if (!confirm(`Clear ALL secrets for ${labelFor(provider)}?`)) return;
    setError(null);
    setNotice(null);
    startClear(async () => {
      const res = await fetch(baseUrl, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true })
      });
      if (!res.ok) {
        setError(`Clear-all failed: ${res.status}`);
        return;
      }
      await refreshStatus();
      setNotice("Cleared all secrets.");
    });
  };

  return (
    <div className="stack">
      {fields.map((f) => {
        // The "configured" check for secret fields: look the key up in
        // the status.configured map. Note the map is keyed by DB key
        // (snake_case, e.g. "kofi.verification_token"), so we have to
        // project from the form's field name (camelCase) to that.
        // The public field is the only one that maps by name.
        let isConfigured = false;
        if (f.key === "broadcasterId") {
          isConfigured = Boolean(status.public.twitchBroadcasterId);
        } else {
          const dbKey = formFieldToDbKey(provider, f.key);
          if (dbKey) {
            isConfigured = status.configured[dbKey] === true;
          }
        }

        return (
          <div key={f.key} className="stack" style={{ gap: 6 }}>
            <label className="muted" htmlFor={`${provider}-${f.key}`}>
              {f.label}
            </label>
            {readOnly ? (
              <div className="muted">
                {isConfigured ? "Configured" : "Not configured"}
              </div>
            ) : (
              <>
                <input
                  id={`${provider}-${f.key}`}
                  className="input"
                  type={f.isPublic ? "text" : "password"}
                  autoComplete="off"
                  placeholder={
                    isConfigured
                      ? "•••••• (configured — type to replace)"
                      : f.placeholder
                  }
                  minLength={f.minLength}
                  maxLength={f.maxLength ?? (f.isPublic ? 32 : 256)}
                  value={values[f.key] ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                />
                <div className="muted" style={{ fontSize: "0.85em" }}>
                  {isConfigured ? "✓ Configured" : "Not configured"}
                  {!f.isPublic && isConfigured ? (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => clearField(f.key)}
                        disabled={clearing}
                      >
                        Clear
                      </button>
                    </>
                  ) : null}
                </div>
              </>
            )}
          </div>
        );
      })}

      {!readOnly ? (
        <div className="stack" style={{ flexDirection: "row", gap: 8 }}>
          <button
            className="button"
            type="button"
            onClick={save}
            disabled={saving || clearing || !hasAnyValue(values)}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            className="button-secondary"
            type="button"
            onClick={clearAll}
            disabled={saving || clearing}
          >
            {clearing ? "Clearing..." : "Clear all"}
          </button>
        </div>
      ) : null}

      {status.isEnabled ? (
        <p className="muted" style={{ color: "var(--accent)" }}>
          ✓ {labelFor(provider)} integration is enabled
        </p>
      ) : null}

      {notice ? <p className="muted">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

// Map a form field name (camelCase) to the DB credential key (snake_case).
// Mirrors the mapping in apps/web/src/lib/integration-credential-schemas.ts
// (`fieldToDbKey`). The form treats `broadcasterId` as a public field and
// does not pass it through this mapping — the server routes it to the
// public column directly. So this helper is for secret fields only.
function formFieldToDbKey(
  provider: IntegrationProvider,
  field: string
): import("@multi-stream-alerts/database").IntegrationCredentialKey | null {
  if (provider === "twitch") {
    if (field === "eventsubSecret") return "twitch.eventsub_secret";
    if (field === "clientId") return "twitch.client_id";
    if (field === "clientSecret") return "twitch.client_secret";
    return null;
  }
  if (provider === "youtube") {
    if (field === "clientId") return "youtube.client_id";
    if (field === "clientSecret") return "youtube.client_secret";
    return null;
  }
  if (provider === "kofi" && field === "verificationToken") {
    return "kofi.verification_token";
  }
  return null;
}

function hasAnyValue(values: Record<string, string>): boolean {
  for (const v of Object.values(values)) {
    if (v && v.length > 0) return true;
  }
  return false;
}
