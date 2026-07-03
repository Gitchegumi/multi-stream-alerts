'use client';

import { useState, useTransition } from 'react';

export function DangerZone({
  channelSlug,
  canManage,
}: {
  channelSlug: string;
  canManage: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  function deleteWorkspace() {
    startTransition(async () => {
      const response = await fetch(`/api/channels/${encodeURIComponent(channelSlug)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        return;
      }
      window.location.href = '/dashboard';
    });
  }

  return (
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
            <button className="button" type="button" disabled={isPending} onClick={deleteWorkspace}>
              Confirm delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
