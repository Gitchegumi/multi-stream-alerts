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
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  function deleteWorkspace() {
    setResult(null);
    startTransition(async () => {
      const response = await fetch(`/api/channels/${encodeURIComponent(channelSlug)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        setResult('Could not delete workspace.');
        return;
      }
      window.location.href = '/dashboard';
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

      <div className="danger-zone" style={{ marginTop: 24 }}>
        <h3>Danger zone</h3>
        {!confirmDelete ? (
          <button
            className="button-secondary"
            type="button"
            disabled={!canManage || isPending}
            onClick={() => setConfirmDelete(true)}
          >
            Delete workspace
          </button>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            <p className="muted">
              This will permanently delete the workspace and all associated data. Are you sure?
            </p>
            <div className="stack" style={{ flexDirection: 'row', gap: 8 }}>
              <button
                className="button-secondary"
                type="button"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                className="button"
                type="button"
                disabled={isPending}
                onClick={deleteWorkspace}
              >
                Confirm delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
