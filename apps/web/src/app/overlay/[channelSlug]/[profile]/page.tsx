import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@multi-stream-alerts/database';
import { OverlayClient } from '@/components/OverlayClient';
import {
  normalizeCanvasSettings,
  type CanvasElement,
  type CanvasSettings,
} from '@/lib/canvas-schema';
import {
  getClientIp,
  isOverlayRouteRateLimited,
  resolveScopedOverlayProfile,
} from '@/lib/overlay-access';

export const dynamic = 'force-dynamic';

export default async function ScopedOverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ channelSlug: string; profile: string }>;
  searchParams: Promise<{ displayKey?: string }>;
}) {
  const { channelSlug, profile } = await params;
  const { displayKey } = await searchParams;

  if (!displayKey) {
    notFound();
  }

  const requestHeaders = await headers();
  const clientIp = getClientIp({ headers: requestHeaders });
  if (isOverlayRouteRateLimited(clientIp)) {
    return (
      <main className="overlay-denied">
        <p>Too many overlay attempts.</p>
      </main>
    );
  }

  const overlayProfile = await resolveScopedOverlayProfile({
    channelSlug,
    profileSlug: profile,
    displayKey,
  });

  if (!overlayProfile) {
    return (
      <main className="overlay-denied">
        <p>Invalid overlay display key.</p>
      </main>
    );
  }

  const settings = await readCanvasSettings(overlayProfile.settingsJson, overlayProfile.channelId);

  return <OverlayClient displayKey={displayKey} profile={profile} settings={settings} />;
}

async function readCanvasSettings(value: unknown, channelId: string) {
  const settings = normalizeCanvasSettings(value).settings;
  const assetIds = settings.elements.flatMap((element) =>
    element.type === 'alert-image' && element.bindings.assetId ? [element.bindings.assetId] : [],
  );
  if (!assetIds.length) return settings;

  const assets = await prisma.workspaceAsset.findMany({
    where: { channelId, id: { in: [...new Set(assetIds)] } },
    select: { id: true, assetType: true },
  });
  const assetTypes = new Map(assets.map((asset) => [asset.id, asset.assetType]));

  return {
    ...settings,
    elements: settings.elements.map((element): CanvasElement => {
      if (element.type !== 'alert-image' || !element.bindings.assetId) return element;
      const assetType = assetTypes.get(element.bindings.assetId);
      if (assetType !== 'image' && assetType !== 'video') return element;
      return {
        ...element,
        bindings: {
          ...element.bindings,
          assetType,
        },
      };
    }),
  } satisfies CanvasSettings;
}
