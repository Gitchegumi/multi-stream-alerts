'use client';

import { useMemo, useState, useTransition } from 'react';

type CanvasSettings = {
  width: number;
  height: number;
  background: 'transparent' | 'dark';
  alertEventKeys: string[];
};

type CanvasProfile = {
  id: string;
  name: string;
  slug: string;
  displayKey: string;
  isActive: boolean;
  updatedAt: string;
  url: string;
  settings: CanvasSettings;
};

type AlertConfig = {
  id: string;
  enabled: boolean;
  layoutId: string | null;
  alertEventType: {
    platform: string;
    eventKey: string;
    displayName: string;
  };
};

type AlertLayout = {
  id: string;
  name: string;
  style: string;
};

export function CanvasWorkspace({
  channelId,
  channelSlug,
  initialCanvases,
  alertConfigs,
  layouts,
}: {
  channelId: string;
  channelSlug: string;
  initialCanvases: CanvasProfile[];
  alertConfigs: AlertConfig[];
  layouts: AlertLayout[];
}) {
  const [canvases, setCanvases] = useState(initialCanvases);
  const [configs, setConfigs] = useState(alertConfigs);
  const [selectedSlug, setSelectedSlug] = useState(initialCanvases[0]?.slug ?? '');
  const [draftName, setDraftName] = useState(initialCanvases[0]?.name ?? '');
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = canvases.find((canvas) => canvas.slug === selectedSlug) ?? canvases[0];
  const assignedKeys = new Set(selected?.settings.alertEventKeys ?? []);
  const groupedConfigs = useMemo(() => {
    return configs.reduce<Record<string, AlertConfig[]>>((groups, config) => {
      const platform = config.alertEventType.platform;
      groups[platform] = groups[platform] ?? [];
      groups[platform]?.push(config);
      return groups;
    }, {});
  }, [configs]);

  function selectCanvas(slug: string) {
    const next = canvases.find((canvas) => canvas.slug === slug);
    setSelectedSlug(slug);
    setDraftName(next?.name ?? '');
    setResult(null);
  }

  function createCanvas(duplicateFromSlug?: string) {
    const source = duplicateFromSlug
      ? canvases.find((canvas) => canvas.slug === duplicateFromSlug)
      : undefined;
    const name = source ? `${source.name} copy` : 'New canvas';
    setResult(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/overlay-profiles`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, duplicateFromSlug }),
        },
      );
      if (!response.ok) {
        setResult('Could not create canvas.');
        return;
      }
      const body = (await response.json()) as { profile: RawProfile };
      const canvas = normalizeProfile(body.profile, channelSlug);
      setCanvases((current) => [...current, canvas]);
      setSelectedSlug(canvas.slug);
      setDraftName(canvas.name);
      setResult(source ? 'Canvas duplicated.' : 'Canvas created.');
    });
  }

  function patchCanvas(
    slug: string,
    patch: Omit<Partial<CanvasProfile>, 'settings'> & { settings?: Partial<CanvasSettings> },
  ) {
    setResult(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/overlay-profiles/${encodeURIComponent(slug)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: patch.name,
            slug: patch.slug,
            isActive: patch.isActive,
            settings: patch.settings,
          }),
        },
      );
      if (!response.ok) {
        setResult('Could not update canvas.');
        return;
      }
      const body = (await response.json()) as { profile: RawProfile };
      const canvas = normalizeProfile(body.profile, channelSlug);
      setCanvases((current) => current.map((item) => (item.id === canvas.id ? canvas : item)));
      setSelectedSlug(canvas.slug);
      setDraftName(canvas.name);
      setResult('Canvas updated.');
    });
  }

  function deleteCanvas(slug: string) {
    setResult(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/overlay-profiles/${encodeURIComponent(slug)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        setResult('Could not delete canvas.');
        return;
      }
      setCanvases((current) => {
        const next = current.filter((canvas) => canvas.slug !== slug);
        const replacement = next[0]?.slug ?? '';
        setSelectedSlug(replacement);
        setDraftName(next[0]?.name ?? '');
        return next;
      });
      setResult('Canvas deleted.');
    });
  }

  async function copyUrl() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.url);
      setResult('Canvas URL copied.');
    } catch {
      setResult('Could not copy the URL.');
    }
  }

  function toggleAlert(config: AlertConfig, checked: boolean) {
    if (!selected) return;
    const nextKeys = applyAlertAssignment(
      selected.settings.alertEventKeys,
      config.alertEventType.eventKey,
      checked,
    );
    patchCanvas(selected.slug, { settings: { alertEventKeys: nextKeys } });
    if (checked && !config.enabled) {
      enableAlertConfig(config);
    }
  }

  function enableAlertConfig(config: AlertConfig) {
    startTransition(async () => {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/alert-configs/${encodeURIComponent(
          config.id,
        )}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: true }),
        },
      );
      if (!response.ok) {
        setResult('Canvas assignment saved, but the alert type could not be enabled.');
        return;
      }
      const body = (await response.json()) as { config: AlertConfig };
      setConfigs((current) => current.map((item) => (item.id === config.id ? body.config : item)));
    });
  }

  function testAlert(eventKey = 'manual.test') {
    if (!selected) return;
    startTransition(async () => {
      const response = await fetch('/api/test-alert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channelId,
          eventKey,
          message: `Canvas preview for ${selected.name}.`,
          isPublic: true,
        }),
      });
      setResult(response.ok ? 'Test alert sent.' : 'Test alert was not sent.');
    });
  }

  if (!selected) {
    return (
      <section className="panel">
        <button
          className="button"
          type="button"
          disabled={isPending}
          onClick={() => createCanvas()}
        >
          Create canvas
        </button>
      </section>
    );
  }

  return (
    <div className="canvas-workspace">
      <aside className="canvas-panel canvas-list-panel">
        <div className="canvas-panel-header">
          <h2>Canvases</h2>
          <button
            className="button"
            type="button"
            disabled={isPending}
            onClick={() => createCanvas()}
          >
            Create
          </button>
        </div>
        <div className="canvas-list">
          {canvases.map((canvas) => (
            <button
              className={`canvas-list-item${canvas.slug === selected.slug ? ' canvas-list-item-active' : ''}`}
              key={canvas.id}
              type="button"
              onClick={() => selectCanvas(canvas.slug)}
            >
              <strong>{canvas.name}</strong>
              <span>
                {canvas.settings.width}x{canvas.settings.height}
              </span>
              <span>
                {canvas.isActive ? 'Active' : 'Inactive'} /{' '}
                {new Date(canvas.updatedAt).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <main className="canvas-main">
        {result ? <p className="muted">{result}</p> : null}
        <section className="canvas-url-bar">
          <div>
            <span className="muted small">Browser-source URL</span>
            <div className="url-item">{selected.url}</div>
          </div>
          <button className="button-secondary" type="button" onClick={copyUrl}>
            Copy URL
          </button>
        </section>

        <section className="canvas-preview-shell">
          <div
            className={`canvas-preview canvas-preview-${selected.settings.background}`}
            style={{ aspectRatio: `${selected.settings.width} / ${selected.settings.height}` }}
          >
            <iframe title={`${selected.name} preview`} src={selected.url} />
          </div>
        </section>

        <section className="canvas-settings-grid">
          <label className="field">
            <span>Name</span>
            <input
              className="input"
              value={draftName}
              onChange={(event) => setDraftName(event.currentTarget.value)}
              onBlur={(event) => {
                const name = event.currentTarget.value.trim();
                if (name && name !== selected.name) patchCanvas(selected.slug, { name });
              }}
            />
          </label>
          <label className="field">
            <span>Width</span>
            <input
              className="input"
              type="number"
              min={320}
              max={7680}
              value={selected.settings.width}
              onChange={(event) =>
                patchCanvas(selected.slug, {
                  settings: { width: Number(event.currentTarget.value) },
                })
              }
            />
          </label>
          <label className="field">
            <span>Height</span>
            <input
              className="input"
              type="number"
              min={240}
              max={4320}
              value={selected.settings.height}
              onChange={(event) =>
                patchCanvas(selected.slug, {
                  settings: { height: Number(event.currentTarget.value) },
                })
              }
            />
          </label>
          <label className="field">
            <span>Background</span>
            <select
              className="select"
              value={selected.settings.background}
              onChange={(event) =>
                patchCanvas(selected.slug, {
                  settings: {
                    background: event.currentTarget.value as CanvasSettings['background'],
                  },
                })
              }
            >
              <option value="transparent">Transparent</option>
              <option value="dark">Dark preview</option>
            </select>
          </label>
          <label className="toggle-line canvas-active-toggle">
            <input
              type="checkbox"
              checked={selected.isActive}
              onChange={(event) =>
                patchCanvas(selected.slug, { isActive: event.currentTarget.checked })
              }
            />
            Active
          </label>
        </section>

        <div className="canvas-actions">
          <button
            className="button-secondary"
            type="button"
            disabled={isPending}
            onClick={() => testAlert()}
          >
            Test canvas
          </button>
          <button
            className="button-secondary"
            type="button"
            disabled={isPending}
            onClick={() => createCanvas(selected.slug)}
          >
            Duplicate
          </button>
          <button
            className="button-secondary"
            type="button"
            disabled={isPending || canvases.length <= 1}
            onClick={() => deleteCanvas(selected.slug)}
          >
            Delete
          </button>
        </div>

        <section className="panel">
          <h2>Alert layouts</h2>
          <div className="canvas-layout-links">
            {layouts.map((layout) => (
              <a
                className="button-secondary"
                key={layout.id}
                href={`/dashboard/${encodeURIComponent(channelSlug)}/overlay/${encodeURIComponent(layout.id)}/edit`}
              >
                Edit {layout.name}
              </a>
            ))}
          </div>
        </section>
      </main>

      <aside className="canvas-panel">
        <h2>Alert Types</h2>
        {Object.entries(groupedConfigs).map(([platform, configs]) => (
          <div className="canvas-alert-group" key={platform}>
            <h3>{platformLabel(platform)}</h3>
            {configs.map((config) => (
              <label className="canvas-alert-row" key={config.id}>
                <input
                  type="checkbox"
                  checked={assignedKeys.has(config.alertEventType.eventKey)}
                  onChange={(event) => toggleAlert(config, event.currentTarget.checked)}
                />
                <span>
                  <strong>{config.alertEventType.displayName}</strong>
                  <span className="muted small">
                    {config.alertEventType.eventKey}
                    {config.enabled ? '' : ' / disabled'}
                  </span>
                </span>
                <button
                  className="link-button"
                  type="button"
                  disabled={isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    testAlert(config.alertEventType.eventKey);
                  }}
                >
                  Test
                </button>
              </label>
            ))}
          </div>
        ))}
      </aside>
    </div>
  );
}

type RawProfile = Omit<CanvasProfile, 'updatedAt' | 'url' | 'settings'> & {
  updatedAt?: string | Date;
  url?: string;
  settings?: Partial<CanvasSettings>;
  settingsJson?: unknown;
};

function normalizeProfile(profile: RawProfile, channelSlug: string): CanvasProfile {
  const settings = readSettings(profile.settings ?? profile.settingsJson);
  return {
    id: profile.id,
    name: profile.name,
    slug: profile.slug,
    displayKey: profile.displayKey,
    isActive: profile.isActive,
    updatedAt: new Date(profile.updatedAt ?? Date.now()).toISOString(),
    url:
      profile.url ??
      `${clientOrigin()}/overlay/${channelSlug}/${profile.slug}?displayKey=${encodeURIComponent(
        profile.displayKey,
      )}`,
    settings,
  };
}

function clientOrigin() {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

function readSettings(value: unknown): CanvasSettings {
  const settings = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const raw = settings as Partial<CanvasSettings>;
  return {
    width: Number.isFinite(raw.width) ? Number(raw.width) : 1920,
    height: Number.isFinite(raw.height) ? Number(raw.height) : 1080,
    background: raw.background === 'dark' ? 'dark' : 'transparent',
    alertEventKeys: Array.isArray(raw.alertEventKeys) ? raw.alertEventKeys.filter(isString) : [],
  };
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function applyAlertAssignment(currentKeys: string[], eventKey: string, assigned: boolean) {
  const nextKeys = new Set(currentKeys);
  if (assigned) {
    nextKeys.add(eventKey);
  } else {
    nextKeys.delete(eventKey);
  }
  return [...nextKeys];
}

function platformLabel(platform: string) {
  const labels: Record<string, string> = {
    generic: 'Generic/API',
    kofi: 'Ko-fi',
    manual: 'Manual',
    twitch: 'Twitch',
    youtube: 'YouTube',
  };
  return labels[platform] ?? platform;
}
