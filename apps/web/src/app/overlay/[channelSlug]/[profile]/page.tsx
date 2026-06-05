import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { OverlayClient } from '@/components/OverlayClient';
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
  const settings = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const alertEventKeys = Array.isArray((settings as { alertEventKeys?: unknown }).alertEventKeys)
    ? ((settings as { alertEventKeys: unknown[] }).alertEventKeys.filter(
        (key): key is string => typeof key === 'string',
      ) ?? [])
    : [];

  return {
    alertEventKeys,
  };
}
