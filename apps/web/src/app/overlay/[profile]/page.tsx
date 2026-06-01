import { notFound } from "next/navigation";
import { prisma } from "@multi-stream-alerts/database";
import { OverlayClient } from "@/components/OverlayClient";

export const dynamic = "force-dynamic";

const allowedProfiles = new Set(["main", "vertical", "test"]);

export default async function OverlayPage({
  params,
  searchParams
}: {
  params: Promise<{ profile: string }>;
  searchParams: Promise<{ displayKey?: string }>;
}) {
  const { profile } = await params;
  const { displayKey } = await searchParams;

  if (!allowedProfiles.has(profile) || !displayKey) {
    notFound();
  }

  const overlayProfile = await prisma.overlayProfile.findUnique({ where: { displayKey } });

  if (!overlayProfile?.isActive || overlayProfile.slug !== profile) {
    return (
      <main className="overlay-denied">
        <p>Invalid overlay display key.</p>
      </main>
    );
  }

  return <OverlayClient displayKey={displayKey} profile={profile} />;
}
