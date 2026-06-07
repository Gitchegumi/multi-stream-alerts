import { notFound, redirect } from 'next/navigation';
import { canViewChannel, prisma } from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';
import { getDocsUrl } from '@/lib/docs-url';

export const dynamic = 'force-dynamic';

export default async function GuidePage({ params }: { params: Promise<{ channelSlug: string }> }) {
  const session = await requireDashboardSession();
  const { channelSlug } = await params;

  const channel = await prisma.channel.findUnique({ where: { slug: channelSlug } });
  if (!channel) notFound();

  const canView = await canViewChannel(session.user.id, session.user.role, channel.id);
  if (!canView) redirect('/dashboard?error=forbidden');

  redirect(getDocsUrl());
}
