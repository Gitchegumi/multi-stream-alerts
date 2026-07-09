import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@multi-stream-alerts/database';
import { OverlayClient } from '@/components/OverlayClient';
import { resolveCanvasSettingsAssetTypes } from '@/lib/canvas-asset-types';
import { normalizeCanvasSettings } from '@/lib/canvas-schema';
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
      <main className="overlay-denied grid min-h-screen place-items-center bg-[rgba(24,25,29,0.94)] text-danger">
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
      <main className="overlay-denied grid min-h-screen place-items-center bg-[rgba(24,25,29,0.94)] text-danger">
        <p>Invalid overlay display key.</p>
      </main>
    );
  }

  const settings = await resolveCanvasSettingsAssetTypes(
    normalizeCanvasSettings(overlayProfile.settingsJson).settings,
    overlayProfile.channelId,
    prisma,
  );

  return <OverlayClient displayKey={displayKey} profile={profile} settings={settings} />;
}
