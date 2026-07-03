'use client';

import { useState, useTransition } from 'react';

export function WorkspaceSettingsForm({
  channelSlug,
  initialName,
  canManage,
}: {
  channelSlug: string;
  initialName: string;
  canManage: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateName() {
    setResult(null);
    startTransition(async () => {
      const response = await fetch(`/api/channels/${encodeURIComponent(channelSlug)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!response.ok) {
        setResult('Could not update workspace name.');
        return;
      }
      setResult('Workspace name updated.');
    });
  }

  return (
    <div className="settings-form">
      {result ? <p className="muted">{result}</p> : null}

      <label className="field">
        <span>Workspace name</span>
        <input
          className="input"
          value={name}
          disabled={!canManage || isPending}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </label>
      <button
        className="button"
        type="button"
        disabled={!canManage || isPending || name.trim() === initialName}
        onClick={updateName}
      >
        Save name
      </button>
    </div>
  );
}
