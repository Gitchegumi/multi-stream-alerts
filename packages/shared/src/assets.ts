import { z } from 'zod';

export const assetTypes = ['image', 'video', 'audio'] as const;
export const assetSourceTypes = ['local', 's3', 'external_url'] as const;

export const defaultAllowedAssetMimeTypes = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
] as const;

export type AssetType = (typeof assetTypes)[number];

export const externalAssetUrlSchema = z
  .string()
  .trim()
  .max(1000)
  .url()
  .refine((value) => {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  }, 'External asset URL must be http or https.');

export function assetTypeForMime(mimeType: string): AssetType | null {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return null;
}

export function extensionForMime(mimeType: string) {
  const extensions: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
  };
  return extensions[mimeType] ?? 'bin';
}
