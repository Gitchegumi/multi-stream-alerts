import { redirect } from 'next/navigation';
import { ensureDefaultChannel, getAuthorizedChannels } from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireDashboardSession();
  await ensureDefaultChannel();
  const channels = await getAuthorizedChannels(session.user.id, session.user.role);
  const selectedChannel = channels[0];

  const { error: errorParam } = await searchParams;

  if (!selectedChannel) {
    return (
      <main className="dashboard-shell">
        {errorParam === 'forbidden' ? (
          <p className="error" role="alert" style={{ marginTop: 12 }}>
            You don't have access to that channel.
          </p>
        ) : null}
        <p className="muted">No channel access has been assigned for this account.</p>
      </main>
    );
  }

  redirect(`/dashboard/${encodeURIComponent(selectedChannel.slug)}`);
}
