import { notFound, redirect } from 'next/navigation';
import { prisma, canViewChannel, canManageChannel } from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';
import { WorkspaceSettingsForm } from '@/components/WorkspaceSettingsForm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
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

  const canManage = await canManageChannel(session.user.id, session.user.role, channel.id);

  return (
    <main className="dashboard-shell">
      <section className="panel">
        <h2>Settings</h2>
        <p className="muted">
          Managing <strong>{channel.name}</strong>.
          {canManage
            ? ' You can edit settings below.'
            : ' You can view settings but not edit them.'}
        </p>
        <WorkspaceSettingsForm
          channelSlug={channel.slug}
          initialName={channel.name}
          canManage={canManage}
        />
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Integrations</h2>
        <p className="muted">
          Manage provider credentials and webhook settings for Twitch, YouTube, and Ko-fi.
        </p>
        <Link
          className="button-secondary"
          href={`/dashboard/${encodeURIComponent(channel.slug)}/integrations`}
        >
          Open integrations
        </Link>
      </section>
    </main>
  );
}
