import {
  assetTypeForMime,
  defaultAllowedAssetMimeTypes,
  type AssetType,
} from '@multi-stream-alerts/shared';

const extensionMimeTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
};

export type ValidatedAsset = {
  mimeType: string;
  assetType: AssetType;
};

export function validateUploadedAsset(input: {
  filename: string;
  declaredMimeType: string;
  body: Buffer;
  allowedMimeTypes?: string[];
}): ValidatedAsset {
  const allowed = input.allowedMimeTypes?.length
    ? input.allowedMimeTypes
    : [...defaultAllowedAssetMimeTypes];
  const extension = input.filename.split('.').pop()?.toLowerCase() ?? '';
  const extensionMimeType = extensionMimeTypes[extension];
  const detectedMimeType = detectMimeType(input.body);
  const mimeType = detectedMimeType ?? extensionMimeType ?? input.declaredMimeType;

  if (!extensionMimeType || !allowed.includes(extensionMimeType)) {
    throw new Error('This file extension is not allowed.');
  }

  if (!mimeType || mimeType !== extensionMimeType || !allowed.includes(mimeType)) {
    throw new Error('The uploaded file type could not be verified.');
  }

  if (mimeType === 'image/svg+xml') {
    validateSvg(input.body);
  }

  const assetType = assetTypeForMime(mimeType);
  if (!assetType) {
    throw new Error('Unsupported asset type.');
  }

  return { mimeType, assetType };
}

export function guessExternalAssetType(url: string): ValidatedAsset {
  const pathname = new URL(url).pathname;
  const extension = pathname.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = extensionMimeTypes[extension];
  const assetType = mimeType ? assetTypeForMime(mimeType) : null;

  if (!mimeType || !assetType) {
    throw new Error('External URL must end with a supported asset extension.');
  }

  return { mimeType, assetType };
}

function detectMimeType(body: Buffer) {
  if (body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return 'image/jpeg';
  }
  if (body.subarray(0, 4).toString('ascii') === 'RIFF') {
    const kind = body.subarray(8, 12).toString('ascii');
    if (kind === 'WEBP') return 'image/webp';
    if (kind === 'WAVE') return 'audio/wav';
  }
  if (
    body.subarray(0, 6).toString('ascii') === 'GIF87a' ||
    body.subarray(0, 6).toString('ascii') === 'GIF89a'
  ) {
    return 'image/gif';
  }
  if (body.subarray(4, 8).toString('ascii') === 'ftyp') {
    return 'video/mp4';
  }
  if (body.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return 'video/webm';
  }
  if (
    body.subarray(0, 3).toString('ascii') === 'ID3' ||
    body.subarray(0, 2).equals(Buffer.from([0xff, 0xfb]))
  ) {
    return 'audio/mpeg';
  }
  if (body.subarray(0, 4).toString('ascii') === 'OggS') {
    return 'audio/ogg';
  }

  const head = body.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<svg') || head.startsWith('<?xml')) {
    return 'image/svg+xml';
  }

  return null;
}

function validateSvg(body: Buffer) {
  const text = body.toString('utf8').toLowerCase();
  if (text.includes('<script') || text.includes('javascript:') || /\son[a-z]+\s*=/.test(text)) {
    throw new Error('SVG files cannot contain scripts or event handlers.');
  }
}
