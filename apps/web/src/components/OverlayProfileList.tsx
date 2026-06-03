'use client';

import { useState, useTransition } from 'react';

type Profile = {
  id: string;
  name: string;
  slug: string;
  displayKey: string;
  isActive: boolean;
  url: string;
};

export function OverlayProfileList({
  channelSlug,
  profiles,
}: {
  channelSlug: string;
  profiles: Profile[];
}) {
  const [items, setItems] = useState(profiles);
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function rotateKey(profileSlug: string) {
    setResult(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/overlay-profiles/${encodeURIComponent(profileSlug)}/rotate-key`,
        { method: 'POST' },
      );
      if (!response.ok) {
        setResult('Could not rotate key.');
        return;
      }
      const body = (await response.json()) as { displayKey: string };
      setItems((current) =>
        current.map((item) =>
          item.slug === profileSlug ? { ...item, displayKey: body.displayKey } : item,
        ),
      );
      setResult('Overlay key rotated.');
    });
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setResult('Copied to clipboard.');
    } catch {
      setResult('Failed to copy.');
    }
  }

  return (
    <div className="overlay-profile-list">
      {result ? <p className="muted">{result}</p> : null}

      {items.length === 0 ? (
        <p className="muted">No overlay profiles found.</p>
      ) : (
        items.map((profile) => (
          <article className="overlay-profile-row" key={profile.id}>
            <div className="overlay-profile-info">
              <strong>{profile.name}</strong>
              {!profile.isActive && <span className="badge muted">Inactive</span>}
            </div>
            <div className="url-item">{profile.url}</div>
            <div className="muted small">Key: {profile.displayKey.slice(0, 12)}…</div>
            <div className="overlay-profile-actions">
              <button
                className="button-secondary"
                type="button"
                disabled={isPending}
                onClick={() => copyUrl(profile.url)}
              >
                Copy URL
              </button>
              <button
                className="button-secondary"
                type="button"
                disabled={isPending}
                onClick={() => rotateKey(profile.slug)}
              >
                Rotate key
              </button>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
