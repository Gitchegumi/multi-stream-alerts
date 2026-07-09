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
    <div className="mt-6 border-t border-line pt-4">
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
        <div className="grid gap-2">
          <p className="muted">
            This will permanently delete the workspace and all associated data. Are you sure?
          </p>
          <div className="grid gap-2">
            <button
              className="button-secondary"
              type="button"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
            <button
              className="button bg-attention text-[#17120a] shadow-[0_8px_24px_rgba(252,163,17,0.2)] hover:bg-[#ffbb47]"
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
  );
}
