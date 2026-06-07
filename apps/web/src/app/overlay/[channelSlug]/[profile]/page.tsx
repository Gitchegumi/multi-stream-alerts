import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { OverlayClient } from '@/components/OverlayClient';
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

  return (
    <OverlayClient
      displayKey={displayKey}
      profile={profile}
      settings={readCanvasSettings(overlayProfile.settingsJson)}
    />
  );
}

function readCanvasSettings(value: unknown) {
  return normalizeCanvasSettings(value).settings;
}
