import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extensionForMime } from '@multi-stream-alerts/shared';

export type StoredAsset = {
  provider: 'local' | 's3';
  key: string;
  storedFilename: string;
};

type StorageProvider = {
  put(input: { channelId: string; body: Buffer; mimeType: string }): Promise<StoredAsset>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
};

export function configuredStorageProvider(): 'local' | 's3' {
  return process.env.STORAGE_PROVIDER === 's3' ? 's3' : 'local';
}

export function getAssetStorage(): StorageProvider {
  return configuredStorageProvider() === 's3' ? new S3AssetStorage() : new LocalAssetStorage();
}

class LocalAssetStorage implements StorageProvider {
  private uploadDir = process.env.UPLOAD_DIR ?? process.env.ASSETS_PATH ?? '/app/uploads';

  async put(input: { channelId: string; body: Buffer; mimeType: string }): Promise<StoredAsset> {
    const channelSegment = safeStorageSegment(input.channelId);
    const storedFilename = `${randomUUID()}.${extensionForMime(input.mimeType)}`;
    const key = `${channelSegment}/${storedFilename}`;
    const targetDir = path.resolve(this.uploadDir, channelSegment);
    const targetPath = path.resolve(targetDir, storedFilename);

    if (!targetPath.startsWith(targetDir + path.sep)) {
      throw new Error('Invalid storage path.');
    }

    await mkdir(targetDir, { recursive: true });
    await writeFile(targetPath, input.body, { flag: 'wx' });
    return { provider: 'local', key, storedFilename };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.resolveKey(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  private resolveKey(key: string) {
    if (key.includes('..') || path.isAbsolute(key)) {
      throw new Error('Invalid storage key.');
    }

    const root = path.resolve(this.uploadDir);
    const target = path.resolve(root, key);
    if (!target.startsWith(root + path.sep)) {
      throw new Error('Invalid storage key.');
    }
    return target;
  }
}

export function safeStorageSegment(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Invalid storage path segment.');
  }
  return value;
}

class S3AssetStorage implements StorageProvider {
  private endpoint = requiredEnv('S3_ENDPOINT');
  private bucket = requiredEnv('S3_BUCKET');
  private region = process.env.S3_REGION ?? 'us-east-1';
  private accessKeyId = requiredEnv('S3_ACCESS_KEY_ID');
  private secretAccessKey = requiredEnv('S3_SECRET_ACCESS_KEY');
  private forcePathStyle = process.env.S3_FORCE_PATH_STYLE !== 'false';

  async put(input: { channelId: string; body: Buffer; mimeType: string }): Promise<StoredAsset> {
    const storedFilename = `${randomUUID()}.${extensionForMime(input.mimeType)}`;
    const key = `${input.channelId}/${storedFilename}`;
    const response = await this.request('PUT', key, input.body, { 'content-type': input.mimeType });
    if (!response.ok) {
      throw new Error(`S3 upload failed with status ${response.status}.`);
    }
    return { provider: 's3', key, storedFilename };
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.request('GET', key);
    if (!response.ok) {
      throw new Error(`S3 download failed with status ${response.status}.`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const response = await this.request('DELETE', key);
    if (!response.ok && response.status !== 404) {
      throw new Error(`S3 delete failed with status ${response.status}.`);
    }
  }

  private async request(method: string, key: string, body?: Buffer, extraHeaders = {}) {
    const url = this.objectUrl(key);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash('sha256')
      .update(body ?? '')
      .digest('hex');
    const headers: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...extraHeaders,
    };
    const signedHeaders = Object.keys(headers)
      .map((name) => name.toLowerCase())
      .sort();
    const canonicalHeaders = signedHeaders.map((name) => `${name}:${headers[name]}\n`).join('');
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const canonicalRequest = [
      method,
      url.pathname,
      url.searchParams.toString(),
      canonicalHeaders,
      signedHeaders.join(';'),
      payloadHash,
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');
    const signature = createHmac('sha256', this.signingKey(dateStamp))
      .update(stringToSign)
      .digest('hex');

    return fetch(url, {
      method,
      body: body ? toArrayBuffer(body) : undefined,
      headers: {
        ...headers,
        authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders.join(';')}, Signature=${signature}`,
      },
    });
  }

  private objectUrl(key: string) {
    const endpoint = new URL(this.endpoint);
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    if (this.forcePathStyle) {
      endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/${this.bucket}/${encodedKey}`;
      return endpoint;
    }

    endpoint.hostname = `${this.bucket}.${endpoint.hostname}`;
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/${encodedKey}`;
    return endpoint;
  }

  private signingKey(dateStamp: string) {
    const dateKey = createHmac('sha256', `AWS4${this.secretAccessKey}`).update(dateStamp).digest();
    const regionKey = createHmac('sha256', dateKey).update(this.region).digest();
    const serviceKey = createHmac('sha256', regionKey).update('s3').digest();
    return createHmac('sha256', serviceKey).update('aws4_request').digest();
  }
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for S3 asset storage.`);
  return value;
}

function toArrayBuffer(buffer: Buffer) {
  return new Uint8Array(buffer).buffer;
}
