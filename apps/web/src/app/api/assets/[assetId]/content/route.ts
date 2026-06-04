import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { canViewChannel, prisma } from '@multi-stream-alerts/database';
import { authOptions } from '@/lib/auth';
import { getAssetStorage } from '@/lib/asset-storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export type HandlerDeps = {
  prisma: typeof prisma;
  canViewChannel: typeof canViewChannel;
  getSession: typeof getServerSession;
  storage: ReturnType<typeof getAssetStorage>;
};

function defaultDeps(): HandlerDeps {
  return {
    prisma,
    canViewChannel,
    getSession: getServerSession,
    storage: getAssetStorage(),
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const result = await handleGet({
    request,
    assetId: (await params).assetId,
  });

  if (result.redirectUrl) {
    return NextResponse.redirect(result.redirectUrl, { status: result.status });
  }

  return new Response(result.body, {
    status: result.status,
    headers: result.headers,
  });
}

export async function handleGet({
  request,
  assetId,
  deps = defaultDeps(),
}: {
  request: Request;
  assetId: string;
  deps?: HandlerDeps;
}): Promise<{
  status: number;
  body?: BodyInit | null;
  headers?: HeadersInit;
  redirectUrl?: string;
}> {
  const asset = await deps.prisma.workspaceAsset.findUnique({ where: { id: assetId } });
  if (!asset) {
    return { status: 404, body: 'Asset not found' };
  }

  const allowed = await canReadAsset(request, asset.channelId, deps);
  if (!allowed) {
    return { status: 403, body: 'Asset access denied' };
  }

  if (asset.externalUrl) {
    return { status: 307, redirectUrl: asset.externalUrl };
  }

  if (!asset.storageKey) {
    return { status: 404, body: 'Asset content unavailable' };
  }

  const body = await deps.storage.get(asset.storageKey);
  return {
    status: 200,
    body: toArrayBuffer(body),
    headers: {
      'content-type': asset.mimeType,
      'cache-control': 'private, max-age=3600',
      'content-length': body.byteLength.toString(),
    },
  };
}

function toArrayBuffer(buffer: Buffer) {
  return new Uint8Array(buffer).buffer;
}

async function canReadAsset(request: Request, channelId: string, deps: HandlerDeps) {
  const displayKey = new URL(request.url).searchParams.get('displayKey');
  if (displayKey) {
    const profile = await deps.prisma.overlayProfile.findUnique({ where: { displayKey } });
    return Boolean(profile?.isActive && profile.channelId === channelId);
  }

  const session = await deps.getSession(authOptions);
  if (!session?.user?.id) {
    return false;
  }

  return deps.canViewChannel(session.user.id, session.user.role, channelId);
}
