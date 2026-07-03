import { redirect, notFound } from 'next/navigation';
import { prisma, canViewChannel } from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ channelSlug: string }>;
}) {
  const session = await requireDashboardSession();
  const { channelSlug } = await params;

  const channel = await prisma.channel.findUnique({ where: { slug: channelSlug } });
  if (!channel) notFound();

  const canView = await canViewChannel(session.user.id, session.user.role, channel.id);
  if (!canView) redirect('/dashboard?error=forbidden');

  redirect(`/dashboard/${encodeURIComponent(channelSlug)}/settings#integrations`);
}
