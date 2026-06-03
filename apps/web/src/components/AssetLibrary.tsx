'use client';

import { useMemo, useState, useTransition } from 'react';

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

type AssetFilter = 'all' | 'image' | 'video' | 'audio';

export function AssetLibrary({
  channelSlug,
  initialAssets,
  initialStorageUsage,
  onAssetsChange,
}: {
  channelSlug: string;
  initialAssets: WorkspaceAsset[];
  initialStorageUsage: { usedBytes: string; quotaBytes: string; maxFileSizeBytes: string };
  onAssetsChange?: (assets: WorkspaceAsset[]) => void;
}) {
  const [assets, setAssets] = useState(initialAssets);
  const [storageUsage, setStorageUsage] = useState(initialStorageUsage);
  const [filter, setFilter] = useState<AssetFilter>('all');
  const [externalUrl, setExternalUrl] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredAssets = useMemo(() => {
    if (filter === 'all') return assets;
    return assets.filter((asset) => asset.assetType === filter);
  }, [assets, filter]);

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
      onAssetsChange?.(body.assets);
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

  return (
    <div className="asset-library">
      {result ? <p className="muted">{result}</p> : null}

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

      <div className="asset-filters" style={{ marginBottom: 12 }}>
        {(['all', 'image', 'video', 'audio'] as const).map((f) => (
          <button
            key={f}
            className={`button-secondary${filter === f ? ' button-active' : ''}`}
            type="button"
            onClick={() => setFilter(f as AssetFilter)}
          >
            {f === 'all' ? 'All' : (f as string).charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="asset-grid">
        {filteredAssets.map((asset) => (
          <article className="asset-card" key={asset.id}>
            <AssetPreview asset={asset} />
            <strong>{asset.originalFilename ?? asset.externalUrl ?? asset.id}</strong>
            <span className="muted small">
              {asset.assetType} / {asset.mimeType}
              {asset.fileSizeBytes ? ` / ${formatBytes(asset.fileSizeBytes)}` : ''}
            </span>
            <span className="muted small">{asset.usageCount} layout use(s)</span>
            <div className="asset-card-actions">
              <a
                className="button-secondary"
                href={asset.previewUrl}
                target="_blank"
                rel="noreferrer"
              >
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
    </div>
  );
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
