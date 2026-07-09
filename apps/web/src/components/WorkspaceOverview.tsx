'use client';

import { useState } from 'react';
import Link from 'next/link';
import { dashboardHeaderClass, dashboardTitleClass } from '@/components/layout-styles';

type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    email: string;
    displayName: string | null;
  } | null;
  memberCount: number;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

export function WorkspaceOverview({
  total,
  workspaces,
}: {
  total: number;
  workspaces: WorkspaceSummary[];
}) {
  const [query, setQuery] = useState('');
  const filtered = workspaces.filter((ws) => {
    const q = query.toLowerCase();
    return (
      ws.name.toLowerCase().includes(q) ||
      ws.slug.toLowerCase().includes(q) ||
      ws.owner?.email.toLowerCase().includes(q) ||
      false
    );
  });

  return (
    <section>
      <div className={dashboardHeaderClass}>
        <h1 className={dashboardTitleClass}>Workspaces</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="muted">{total} total</span>
        </div>
      </div>

      <div style={{ marginTop: 16, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Filter by name, slug, or owner email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input"
          style={{ width: '100%', maxWidth: 480 }}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="muted">No workspaces match your filter.</p>
      ) : (
        <div className="stack">
          {filtered.map((ws) => (
            <div key={ws.id} className="panel">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{ws.name}</div>
                  <div className="muted small">
                    slug: <code>{ws.slug}</code>
                  </div>
                  <div className="muted small" style={{ marginTop: 4 }}>
                    Created {formatDate(ws.createdAt)} · Updated {formatDate(ws.updatedAt)}
                  </div>
                  <div className="muted small" style={{ marginTop: 4 }}>
                    Members: {ws.memberCount}
                  </div>
                  {ws.owner ? (
                    <div className="muted small" style={{ marginTop: 4 }}>
                      Owner: {ws.owner.displayName ?? ws.owner.email} (<code>{ws.owner.email}</code>
                      )
                    </div>
                  ) : (
                    <div className="muted small" style={{ marginTop: 4 }}>
                      Owner: —
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Link
                    href={`/dashboard/${encodeURIComponent(ws.slug)}`}
                    className="button secondary"
                  >
                    Open
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
