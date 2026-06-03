import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { canViewChannel, prisma } from '@multi-stream-alerts/database';
import { authOptions } from '@/lib/auth';
import { getAssetStorage } from '@/lib/asset-storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const asset = await prisma.workspaceAsset.findUnique({ where: { id: assetId } });
  if (!asset) {
    return new Response('Asset not found', { status: 404 });
  }

  if (asset.externalUrl) {
    return NextResponse.redirect(asset.externalUrl);
  }

  const allowed = await canReadAsset(request, asset.channelId);
  if (!allowed) {
    return new Response('Asset access denied', { status: 403 });
  }
  if (!asset.storageKey) {
    return new Response('Asset content unavailable', { status: 404 });
  }

  const body = await getAssetStorage().get(asset.storageKey);
  return new Response(toArrayBuffer(body), {
    headers: {
      'content-type': asset.mimeType,
      'cache-control': 'private, max-age=3600',
      'content-length': body.byteLength.toString(),
    },
  });
}

function toArrayBuffer(buffer: Buffer) {
  return new Uint8Array(buffer).buffer;
}

async function canReadAsset(request: Request, channelId: string) {
  const displayKey = new URL(request.url).searchParams.get('displayKey');
  if (displayKey) {
    const profile = await prisma.overlayProfile.findUnique({ where: { displayKey } });
    return Boolean(profile?.isActive && profile.channelId === channelId);
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return false;
  }

  return canViewChannel(session.user.id, session.user.role, channelId);
}
