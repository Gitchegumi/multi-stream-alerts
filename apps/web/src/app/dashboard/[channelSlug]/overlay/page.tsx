import { notFound, redirect } from 'next/navigation';
import { prisma, canViewChannel } from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';
import { OverlayProfileList } from '@/components/OverlayProfileList';

export const dynamic = 'force-dynamic';

export default async function OverlayPage({
  params,
}: {
  params: Promise<{ channelSlug: string }>;
}) {
  const session = await requireDashboardSession();
  const { channelSlug } = await params;

  const channel = await prisma.channel.findUnique({
    where: { slug: channelSlug },
    include: { overlayProfiles: true },
  });
  if (!channel) notFound();

  const canView = await canViewChannel(session.user.id, session.user.role, channel.id);
  if (!canView) redirect('/dashboard?error=forbidden');

  const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? 'https://<your-alerts-domain>';
  const profiles = channel.overlayProfiles.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    displayKey: p.displayKey,
    isActive: p.isActive,
    url: `${publicBaseUrl}/overlay/${p.slug}?displayKey=${encodeURIComponent(p.displayKey)}`,
  }));

  return (
    <main className="dashboard-shell">
      <section className="panel">
        <h2>Overlay Profiles</h2>
        <p className="muted">Share these URLs with your streaming software (OBS, etc.).</p>
        <OverlayProfileList channelSlug={channel.slug} profiles={profiles} />
      </section>
    </main>
  );
}
