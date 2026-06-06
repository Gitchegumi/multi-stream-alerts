import { notFound, redirect } from 'next/navigation';
import { canViewChannel, prisma } from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function GuidePage({ params }: { params: Promise<{ channelSlug: string }> }) {
  const session = await requireDashboardSession();
  const { channelSlug } = await params;

  const channel = await prisma.channel.findUnique({ where: { slug: channelSlug } });
  if (!channel) notFound();

  const canView = await canViewChannel(session.user.id, session.user.role, channel.id);
  if (!canView) redirect('/dashboard?error=forbidden');

  const guideUrl =
    process.env.NEXT_PUBLIC_DOCS_URL ?? 'https://gitchegumi.github.io/multi-stream-alerts/';

  return (
    <main className="guide-page">
      <iframe className="guide-frame" title="GitcheGumi Alerts guide" src={guideUrl} />
    </main>
  );
}
