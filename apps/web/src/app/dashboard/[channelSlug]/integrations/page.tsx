import { redirect, notFound } from "next/navigation";
import {
  prisma,
  getChannelCredentialStatus,
  canViewChannel,
  canManageChannelCredentials,
  PROVIDERS,
  type IntegrationProvider
} from "@multi-stream-alerts/database";
import { requireDashboardSession } from "@/lib/session";
import { IntegrationSettingsForm } from "@/components/IntegrationSettingsForm";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({
  params
}: {
  params: Promise<{ channelSlug: string }>;
}) {
  const session = await requireDashboardSession();
  const { channelSlug } = await params;

  const channel = await prisma.channel.findUnique({ where: { slug: channelSlug } });
  if (!channel) notFound();

  const canView = await canViewChannel(session.user.id, session.user.role, channel.id);
  if (!canView) redirect("/dashboard?error=forbidden");

  const canManage = await canManageChannelCredentials(
    session.user.id,
    session.user.role,
    channel.id
  );

  // Fetch status for all three providers in parallel. The status shape
  // is the public one from @multi-stream-alerts/database — no
  // ciphertext, no plaintext.
  const statuses = await Promise.all(
    PROVIDERS.map(async (provider) => ({
      provider,
      status: await getChannelCredentialStatus(channel.id, provider)
    }))
  );

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Integrations</h1>
          <p className="muted">
            Managing <strong>{channel.name}</strong> ({channel.slug}).
            {canManage
              ? " Configure platform credentials below."
              : " You can view settings but not edit them."}
          </p>
        </div>
        <a className="button" href="/dashboard">
          ← Back to dashboard
        </a>
      </header>

      <section className="grid">
        {statuses.map(({ provider, status }) => (
          <div className="panel" key={provider}>
            <h2>{labelForProvider(provider)}</h2>
            <p className="muted">{descriptionForProvider(provider)}</p>
            <IntegrationSettingsForm
              channelSlug={channel.slug}
              provider={provider}
              initialStatus={status}
              readOnly={!canManage}
            />
          </div>
        ))}
      </section>
    </main>
  );
}

function labelForProvider(p: IntegrationProvider): string {
  if (p === "kofi") return "Ko-fi";
  if (p === "twitch") return "Twitch";
  return "YouTube";
}

function descriptionForProvider(p: IntegrationProvider): string {
  if (p === "kofi") return "Webhook verification token from your Ko-fi account settings.";
  if (p === "twitch") return "EventSub secret, client ID, client secret, and broadcaster ID.";
  return "Client ID and client secret for YouTube Data API access.";
}
