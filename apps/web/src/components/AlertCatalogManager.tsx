'use client';

import { useMemo, useState, useTransition } from 'react';

type AlertLayout = {
  id: string;
  name: string;
  style: string;
  visualAssetUrl: string | null;
  soundAssetUrl: string | null;
  visualAssetId: string | null;
  soundAssetId: string | null;
  defaultDurationMs: number;
  defaultVolume: number;
  isSystemPreset: boolean;
};

type WorkspaceAsset = {
  id: string;
  sourceType: string;
  assetType: 'image' | 'video' | 'audio';
  originalFilename: string | null;
  externalUrl: string | null;
  mimeType: string;
  fileSizeBytes: string | null;
  storageProvider: string;
  createdAt: string;
  usageCount: number;
  previewUrl: string;
};

type AlertConfig = {
  id: string;
  enabled: boolean;
  layoutId: string | null;
  displayName: string | null;
  templateText: string | null;
  durationMs: number | null;
  volume: number | null;
  alertEventType: {
    platform: string;
    eventKey: string;
    displayName: string;
  };
};

type ConfigDraft = {
  displayName: string;
  templateText: string;
  durationMs: string;
  volume: string;
};

type LayoutDraft = {
  name: string;
  style: string;
  visualAssetUrl: string;
  soundAssetUrl: string;
  visualAssetId: string;
  soundAssetId: string;
  defaultDurationMs: string;
  defaultVolume: string;
};

export function AlertCatalogManager({
  channelId,
  channelSlug,
  initialConfigs,
  initialLayouts,
  initialAssets,
  initialStorageUsage,
}: {
  channelId: string;
  channelSlug: string;
  initialConfigs: AlertConfig[];
  initialLayouts: AlertLayout[];
  initialAssets: WorkspaceAsset[];
  initialStorageUsage: { usedBytes: string; quotaBytes: string; maxFileSizeBytes: string };
}) {
  const [configs, setConfigs] = useState(initialConfigs);
  const [layouts, setLayouts] = useState(initialLayouts);
  const [assets, setAssets] = useState(initialAssets);
  const [storageUsage, setStorageUsage] = useState(initialStorageUsage);
  const [externalUrl, setExternalUrl] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [configDrafts, setConfigDrafts] = useState<Record<string, ConfigDraft>>(() =>
    Object.fromEntries(initialConfigs.map((config) => [config.id, toConfigDraft(config)])),
  );
  const [layoutDrafts, setLayoutDrafts] = useState<Record<string, LayoutDraft>>(() =>
    Object.fromEntries(initialLayouts.map((layout) => [layout.id, toLayoutDraft(layout)])),
  );
  const [layoutDraft, setLayoutDraft] = useState({
    name: '',
    style: 'vertical',
    visualAssetUrl: '',
    soundAssetUrl: '',
    visualAssetId: '',
    soundAssetId: '',
    defaultDurationMs: 6500,
    defaultVolume: 80,
  });
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const groupedConfigs = useMemo(() => {
    return configs.reduce<Record<string, AlertConfig[]>>((groups, config) => {
      const platform = config.alertEventType.platform;
      groups[platform] = groups[platform] ?? [];
      groups[platform].push(config);
      return groups;
    }, {});
  }, [configs]);

  function updateConfig(config: AlertConfig, patch: Partial<AlertConfig>) {
    const payload = {
      enabled: patch.enabled,
      layoutId: patch.layoutId,
      displayName: patch.displayName,
      templateText: patch.templateText,
      durationMs: patch.durationMs,
      volume: patch.volume,
    };

    setResult(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/alert-configs/${encodeURIComponent(
          config.id,
        )}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        setResult('Could not update alert type.');
        return;
      }

      const body = (await response.json()) as { config: AlertConfig };
      setConfigs((current) => current.map((item) => (item.id === config.id ? body.config : item)));
      setConfigDrafts((current) => ({ ...current, [config.id]: toConfigDraft(body.config) }));
      setResult('Alert type updated.');
    });
  }

  function createLayout() {
    setResult(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/alert-layouts`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...layoutDraft,
            visualAssetUrl: layoutDraft.visualAssetUrl || null,
            soundAssetUrl: layoutDraft.soundAssetUrl || null,
            visualAssetId: layoutDraft.visualAssetId || null,
            soundAssetId: layoutDraft.soundAssetId || null,
          }),
        },
      );

      if (!response.ok) {
        setResult('Could not create layout. Check that the name is unique.');
        return;
      }

      const body = (await response.json()) as { layout: AlertLayout };
      setLayouts((current) => [...current, body.layout]);
      setLayoutDrafts((current) => ({ ...current, [body.layout.id]: toLayoutDraft(body.layout) }));
      setLayoutDraft({
        name: '',
        style: 'vertical',
        visualAssetUrl: '',
        soundAssetUrl: '',
        visualAssetId: '',
        soundAssetId: '',
        defaultDurationMs: 6500,
        defaultVolume: 80,
      });
      setResult('Layout created.');
    });
  }

  function refreshAssets() {
    startTransition(async () => {
      const response = await fetch(`/api/channels/${encodeURIComponent(channelSlug)}/assets`);
      if (!response.ok) {
        setResult('Could not refresh asset library.');
        return;
      }
      const body = (await response.json()) as {
        assets: WorkspaceAsset[];
        usage: { usedBytes: string; quotaBytes: string; maxFileSizeBytes: string };
      };
      setAssets(body.assets);
      setStorageUsage(body.usage);
    });
  }

  function uploadAsset() {
    if (!uploadFile) return;
    setResult(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('mode', 'upload');
      formData.set('file', uploadFile);
      const response = await fetch(`/api/channels/${encodeURIComponent(channelSlug)}/assets`, {
        method: 'POST',
        body: formData,
      });
      setResult(response.ok ? 'Asset uploaded.' : await errorMessage(response, 'Upload failed.'));
      setUploadFile(null);
      if (response.ok) refreshAssets();
    });
  }

  function addExternalAsset() {
    setResult(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('mode', 'external_url');
      formData.set('url', externalUrl);
      const response = await fetch(`/api/channels/${encodeURIComponent(channelSlug)}/assets`, {
        method: 'POST',
        body: formData,
      });
      setResult(
        response.ok
          ? 'External asset added.'
          : await errorMessage(response, 'Could not add asset.'),
      );
      if (response.ok) {
        setExternalUrl('');
        refreshAssets();
      }
    });
  }

  function deleteAsset(asset: WorkspaceAsset, force = false) {
    setResult(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/assets/${encodeURIComponent(asset.id)}${
          force ? '?force=true' : ''
        }`,
        { method: 'DELETE' },
      );
      if (response.status === 409 && !force) {
        setResult('Asset is assigned to a layout. Remove it first or force delete.');
        return;
      }
      setResult(
        response.ok ? 'Asset deleted.' : await errorMessage(response, 'Could not delete asset.'),
      );
      if (response.ok) refreshAssets();
    });
  }

  function updateLayout(layout: AlertLayout, patch: Partial<AlertLayout>) {
    setResult(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/alert-layouts/${encodeURIComponent(
          layout.id,
        )}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        },
      );

      if (!response.ok) {
        setResult('Could not update layout.');
        return;
      }

      const body = (await response.json()) as { layout: AlertLayout };
      setLayouts((current) => current.map((item) => (item.id === layout.id ? body.layout : item)));
      setLayoutDrafts((current) => ({ ...current, [layout.id]: toLayoutDraft(body.layout) }));
      setConfigs((current) =>
        current.map((config) =>
          config.layoutId === layout.id ? { ...config, layoutId: body.layout.id } : config,
        ),
      );
      setResult('Layout updated.');
    });
  }

  function deleteLayout(layout: AlertLayout, fallback = false) {
    setResult(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/channels/${encodeURIComponent(channelSlug)}/alert-layouts/${encodeURIComponent(
          layout.id,
        )}${fallback ? '?fallback=default' : ''}`,
        { method: 'DELETE' },
      );

      if (response.status === 409 && !fallback) {
        setResult('Layout is assigned to alerts. Reassign first or use fallback delete.');
        return;
      }

      if (!response.ok) {
        setResult('Could not delete layout.');
        return;
      }

      const body = (await response.json()) as { fallbackLayoutId: string | null };
      setLayouts((current) => current.filter((item) => item.id !== layout.id));
      setLayoutDrafts((current) => {
        const next = { ...current };
        delete next[layout.id];
        return next;
      });
      setConfigs((current) =>
        current.map((config) =>
          config.layoutId === layout.id ? { ...config, layoutId: body.fallbackLayoutId } : config,
        ),
      );
      setResult('Layout deleted.');
    });
  }

  function testAlert(eventKey: string, layoutId?: string) {
    setResult(null);
    startTransition(async () => {
      const response = await fetch('/api/test-alert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channelId,
          eventKey,
          layoutId,
          message: layoutId ? 'Layout preview alert.' : 'Catalog test alert.',
          isPublic: true,
        }),
      });
      setResult(response.ok ? 'Test alert sent.' : 'Test alert was not sent.');
    });
  }

  function updateConfigDraft(configId: string, patch: Partial<ConfigDraft>) {
    setConfigDrafts((current) => ({
      ...current,
      [configId]: { ...(current[configId] ?? emptyConfigDraft()), ...patch },
    }));
  }

  function updateLayoutDraft(layoutId: string, patch: Partial<LayoutDraft>) {
    setLayoutDrafts((current) => ({
      ...current,
      [layoutId]: { ...(current[layoutId] ?? emptyLayoutDraft()), ...patch },
    }));
  }

  return (
    <div className="catalog-manager">
      {result ? <p className="muted">{result}</p> : null}

      <section className="panel">
        <h2>Asset Library</h2>
        <p className="muted small">
          {formatBytes(storageUsage.usedBytes)} of {formatBytes(storageUsage.quotaBytes)} used. Max
          upload size {formatBytes(storageUsage.maxFileSizeBytes)}.
        </p>
        <div className="asset-actions">
          <label className="field">
            <span>Upload asset</span>
            <input
              className="input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg"
              onChange={(event) => setUploadFile(event.currentTarget.files?.[0] ?? null)}
            />
          </label>
          <button
            className="button"
            type="button"
            disabled={isPending || !uploadFile}
            onClick={uploadAsset}
          >
            Upload
          </button>
          <label className="field">
            <span>External asset URL</span>
            <input
              className="input"
              placeholder="https://example.com/alert.webm"
              value={externalUrl}
              onChange={(event) => setExternalUrl(event.currentTarget.value)}
            />
          </label>
          <button
            className="button-secondary"
            type="button"
            disabled={isPending || !externalUrl.trim()}
            onClick={addExternalAsset}
          >
            Add URL
          </button>
        </div>
        <div className="asset-grid">
          {assets.map((asset) => (
            <article className="asset-card" key={asset.id}>
              <AssetPreview asset={asset} />
              <strong>{asset.originalFilename ?? asset.externalUrl ?? asset.id}</strong>
              <span className="muted small">
                {asset.assetType} / {asset.mimeType}
                {asset.fileSizeBytes ? ` / ${formatBytes(asset.fileSizeBytes)}` : ''}
              </span>
              <span className="muted small">{asset.usageCount} layout use(s)</span>
              <div className="asset-card-actions">
                <a className="button-secondary" href={asset.previewUrl} target="_blank">
                  Preview
                </a>
                <button
                  className="button-secondary"
                  type="button"
                  disabled={isPending}
                  onClick={() => deleteAsset(asset)}
                >
                  Delete
                </button>
                {asset.usageCount > 0 ? (
                  <button
                    className="button-secondary"
                    type="button"
                    disabled={isPending}
                    onClick={() => deleteAsset(asset, true)}
                  >
                    Force delete
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Alert Types</h2>
        <div className="platform-groups">
          {Object.entries(groupedConfigs).map(([platform, platformConfigs]) => (
            <div className="platform-group" key={platform}>
              <h3>{platformLabel(platform)}</h3>
              <div className="alert-config-list">
                {platformConfigs.map((config) => (
                  <article className="alert-config-row" key={config.id}>
                    {(() => {
                      const draft = configDrafts[config.id] ?? toConfigDraft(config);
                      return (
                        <>
                          <div>
                            <label className="toggle-line">
                              <input
                                type="checkbox"
                                checked={config.enabled}
                                disabled={isPending}
                                onChange={(event) =>
                                  updateConfig(config, { enabled: event.currentTarget.checked })
                                }
                              />
                              <strong>
                                {config.displayName ?? config.alertEventType.displayName}
                              </strong>
                            </label>
                            <span className="muted small">{config.alertEventType.eventKey}</span>
                          </div>

                          <label className="field">
                            <span>Layout</span>
                            <select
                              className="select"
                              value={config.layoutId ?? ''}
                              disabled={isPending}
                              onChange={(event) =>
                                updateConfig(config, {
                                  layoutId: event.currentTarget.value || null,
                                })
                              }
                            >
                              <option value="">System default</option>
                              {layouts.map((layout) => (
                                <option key={layout.id} value={layout.id}>
                                  {layout.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="field">
                            <span>Display name override</span>
                            <input
                              className="input"
                              value={draft.displayName}
                              placeholder={config.alertEventType.displayName}
                              onChange={(event) =>
                                updateConfigDraft(config.id, {
                                  displayName: event.currentTarget.value,
                                })
                              }
                              onBlur={(event) =>
                                updateConfig(config, {
                                  displayName: event.currentTarget.value.trim() || null,
                                })
                              }
                            />
                          </label>

                          <label className="field">
                            <span>Message template override</span>
                            <input
                              className="input"
                              value={draft.templateText}
                              placeholder="{{name}} triggered an alert"
                              onChange={(event) =>
                                updateConfigDraft(config.id, {
                                  templateText: event.currentTarget.value,
                                })
                              }
                              onBlur={(event) =>
                                updateConfig(config, {
                                  templateText: event.currentTarget.value.trim() || null,
                                })
                              }
                            />
                          </label>

                          <div className="number-fields">
                            <label className="field">
                              <span>Duration ms</span>
                              <input
                                className="input"
                                type="number"
                                min={500}
                                max={60000}
                                value={draft.durationMs}
                                onChange={(event) =>
                                  updateConfigDraft(config.id, {
                                    durationMs: event.currentTarget.value,
                                  })
                                }
                                onBlur={(event) =>
                                  updateConfig(config, {
                                    durationMs: event.currentTarget.value
                                      ? Number(event.currentTarget.value)
                                      : null,
                                  })
                                }
                              />
                            </label>
                            <label className="field">
                              <span>Volume</span>
                              <input
                                className="input"
                                type="number"
                                min={0}
                                max={100}
                                value={draft.volume}
                                onChange={(event) =>
                                  updateConfigDraft(config.id, {
                                    volume: event.currentTarget.value,
                                  })
                                }
                                onBlur={(event) =>
                                  updateConfig(config, {
                                    volume: event.currentTarget.value
                                      ? Number(event.currentTarget.value)
                                      : null,
                                  })
                                }
                              />
                            </label>
                          </div>

                          <button
                            className="button-secondary"
                            type="button"
                            disabled={isPending || !config.enabled}
                            onClick={() => testAlert(config.alertEventType.eventKey)}
                          >
                            Test
                          </button>
                        </>
                      );
                    })()}
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Layouts</h2>
        <div className="layout-list">
          {layouts.map((layout) => (
            <article className="layout-row" key={layout.id}>
              {(() => {
                const draft = layoutDrafts[layout.id] ?? toLayoutDraft(layout);
                return (
                  <>
                    <label className="field">
                      <span>Name</span>
                      <input
                        className="input"
                        value={draft.name}
                        onChange={(event) =>
                          updateLayoutDraft(layout.id, { name: event.currentTarget.value })
                        }
                        onBlur={(event) =>
                          updateLayout(layout, {
                            name: event.currentTarget.value.trim() || layout.name,
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Style</span>
                      <select
                        className="select"
                        value={draft.style}
                        onChange={(event) => {
                          updateLayoutDraft(layout.id, { style: event.currentTarget.value });
                          updateLayout(layout, { style: event.currentTarget.value });
                        }}
                      >
                        <option value="vertical">Vertical</option>
                        <option value="horizontal">Horizontal</option>
                        <option value="compact">Compact</option>
                        <option value="custom">Custom</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Visual asset</span>
                      <select
                        className="select"
                        value={draft.visualAssetId}
                        onChange={(event) => {
                          updateLayoutDraft(layout.id, {
                            visualAssetId: event.currentTarget.value,
                          });
                          updateLayout(layout, {
                            visualAssetId: event.currentTarget.value || null,
                          });
                        }}
                      >
                        <option value="">URL fallback</option>
                        {assets
                          .filter((asset) => asset.assetType !== 'audio')
                          .map((asset) => (
                            <option key={asset.id} value={asset.id}>
                              {assetLabel(asset)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Sound asset</span>
                      <select
                        className="select"
                        value={draft.soundAssetId}
                        onChange={(event) => {
                          updateLayoutDraft(layout.id, { soundAssetId: event.currentTarget.value });
                          updateLayout(layout, { soundAssetId: event.currentTarget.value || null });
                        }}
                      >
                        <option value="">URL fallback</option>
                        {assets
                          .filter((asset) => asset.assetType === 'audio')
                          .map((asset) => (
                            <option key={asset.id} value={asset.id}>
                              {assetLabel(asset)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div className="number-fields">
                      <label className="field">
                        <span>Duration</span>
                        <input
                          className="input"
                          type="number"
                          min={500}
                          max={60000}
                          value={draft.defaultDurationMs}
                          onChange={(event) =>
                            updateLayoutDraft(layout.id, {
                              defaultDurationMs: event.currentTarget.value,
                            })
                          }
                          onBlur={(event) =>
                            updateLayout(layout, {
                              defaultDurationMs: Number(event.currentTarget.value),
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Volume</span>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          max={100}
                          value={draft.defaultVolume}
                          onChange={(event) =>
                            updateLayoutDraft(layout.id, {
                              defaultVolume: event.currentTarget.value,
                            })
                          }
                          onBlur={(event) =>
                            updateLayout(layout, {
                              defaultVolume: Number(event.currentTarget.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    <button
                      className="button-secondary"
                      type="button"
                      disabled={isPending}
                      onClick={() => testAlert('manual.test', layout.id)}
                    >
                      Preview
                    </button>
                    <button
                      className="button-secondary"
                      type="button"
                      disabled={isPending}
                      onClick={() => deleteLayout(layout)}
                    >
                      Delete
                    </button>
                    <button
                      className="button-secondary"
                      type="button"
                      disabled={isPending}
                      onClick={() => deleteLayout(layout, true)}
                    >
                      Fallback delete
                    </button>
                  </>
                );
              })()}
            </article>
          ))}
        </div>

        <div className="layout-editor">
          <h3>Create layout</h3>
          <input
            className="input"
            placeholder="Layout name"
            value={layoutDraft.name}
            onChange={(event) =>
              setLayoutDraft({ ...layoutDraft, name: event.currentTarget.value })
            }
          />
          <select
            className="select"
            value={layoutDraft.style}
            onChange={(event) =>
              setLayoutDraft({ ...layoutDraft, style: event.currentTarget.value })
            }
          >
            <option value="vertical">Vertical</option>
            <option value="horizontal">Horizontal</option>
            <option value="compact">Compact</option>
            <option value="custom">Custom</option>
          </select>
          <input
            className="input"
            placeholder="Visual asset URL"
            value={layoutDraft.visualAssetUrl}
            onChange={(event) =>
              setLayoutDraft({ ...layoutDraft, visualAssetUrl: event.currentTarget.value })
            }
          />
          <select
            className="select"
            value={layoutDraft.visualAssetId}
            onChange={(event) =>
              setLayoutDraft({ ...layoutDraft, visualAssetId: event.currentTarget.value })
            }
          >
            <option value="">Use visual URL fallback</option>
            {assets
              .filter((asset) => asset.assetType !== 'audio')
              .map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {assetLabel(asset)}
                </option>
              ))}
          </select>
          <input
            className="input"
            placeholder="Sound asset URL"
            value={layoutDraft.soundAssetUrl}
            onChange={(event) =>
              setLayoutDraft({ ...layoutDraft, soundAssetUrl: event.currentTarget.value })
            }
          />
          <select
            className="select"
            value={layoutDraft.soundAssetId}
            onChange={(event) =>
              setLayoutDraft({ ...layoutDraft, soundAssetId: event.currentTarget.value })
            }
          >
            <option value="">Use sound URL fallback</option>
            {assets
              .filter((asset) => asset.assetType === 'audio')
              .map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {assetLabel(asset)}
                </option>
              ))}
          </select>
          <div className="number-fields">
            <input
              className="input"
              type="number"
              min={500}
              max={60000}
              value={layoutDraft.defaultDurationMs}
              onChange={(event) =>
                setLayoutDraft({
                  ...layoutDraft,
                  defaultDurationMs: Number(event.currentTarget.value),
                })
              }
            />
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={layoutDraft.defaultVolume}
              onChange={(event) =>
                setLayoutDraft({ ...layoutDraft, defaultVolume: Number(event.currentTarget.value) })
              }
            />
          </div>
          <button
            className="button"
            type="button"
            disabled={isPending || !layoutDraft.name.trim()}
            onClick={createLayout}
          >
            Create layout
          </button>
        </div>
      </section>
    </div>
  );
}

function toConfigDraft(config: AlertConfig): ConfigDraft {
  return {
    displayName: config.displayName ?? '',
    templateText: config.templateText ?? '',
    durationMs: config.durationMs?.toString() ?? '',
    volume: config.volume?.toString() ?? '',
  };
}

function emptyConfigDraft(): ConfigDraft {
  return { displayName: '', templateText: '', durationMs: '', volume: '' };
}

function toLayoutDraft(layout: AlertLayout): LayoutDraft {
  return {
    name: layout.name,
    style: layout.style,
    visualAssetUrl: layout.visualAssetUrl ?? '',
    soundAssetUrl: layout.soundAssetUrl ?? '',
    visualAssetId: layout.visualAssetId ?? '',
    soundAssetId: layout.soundAssetId ?? '',
    defaultDurationMs: layout.defaultDurationMs.toString(),
    defaultVolume: layout.defaultVolume.toString(),
  };
}

function emptyLayoutDraft(): LayoutDraft {
  return {
    name: '',
    style: 'vertical',
    visualAssetUrl: '',
    soundAssetUrl: '',
    visualAssetId: '',
    soundAssetId: '',
    defaultDurationMs: '',
    defaultVolume: '',
  };
}

function AssetPreview({ asset }: { asset: WorkspaceAsset }) {
  if (asset.assetType === 'audio')
    return <audio className="asset-preview" src={asset.previewUrl} controls />;
  if (asset.assetType === 'video') {
    return (
      <video className="asset-preview" src={asset.previewUrl} muted loop playsInline controls />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="asset-preview" alt="" src={asset.previewUrl} />;
}

function assetLabel(asset: WorkspaceAsset) {
  return asset.originalFilename ?? asset.externalUrl ?? asset.id;
}

async function errorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

function formatBytes(value: string | number) {
  const bytes = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
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
