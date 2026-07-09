import { notFound, redirect } from 'next/navigation';
import {
  prisma,
  canViewChannel,
  canManageChannel,
  canManageChannelCredentials,
  getChannelCredentialStatus,
  PROVIDERS,
  type IntegrationProvider,
} from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';
import { WorkspaceSettingsForm } from '@/components/WorkspaceSettingsForm';
import { DangerZone } from '@/components/DangerZone';
import { IntegrationsSection } from '@/components/IntegrationsSection';
import { twitchEnabled, googleEnabled } from '@/lib/auth';
import { dashboardShellClass } from '@/components/layout-styles';

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
  const canManageCreds = await canManageChannelCredentials(
    session.user.id,
    session.user.role,
    channel.id,
  );

  // Fetch status for all three providers in parallel.
  const statuses = await Promise.all(
    PROVIDERS.map(async (provider) => ({
      provider,
      status: await getChannelCredentialStatus(channel.id, provider),
    })),
  );

  return (
    <main className={dashboardShellClass}>
      {/* 1. Workspace details */}
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

      {/* 2. Integrations */}
      <section className="panel">
        <IntegrationsSection
          channelSlug={channel.slug}
          initialStatuses={statuses}
          canManage={canManageCreds}
          twitchOAuthEnabled={twitchEnabled}
          googleOAuthEnabled={googleEnabled}
        />
      </section>

      {/* 3. Danger Zone (always last) */}
      <section className="panel">
        <DangerZone channelSlug={channel.slug} canManage={canManage} />
      </section>
    </main>
  );
}
