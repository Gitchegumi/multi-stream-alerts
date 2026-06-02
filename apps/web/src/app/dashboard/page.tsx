import { ensureDefaultChannel, getAuthorizedChannels, prisma, toAlertEvent } from "@multi-stream-alerts/database";
import { productName } from "@multi-stream-alerts/ui";
import { ManualAlertForm } from "@/components/ManualAlertForm";
import { requireDashboardSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Map a `?error=...` hint from a server-side redirect to a user-readable
// notice. Unknown values get a generic message — the query param is a
// hint, not user input, so we never echo the raw value.
function errorNoticeFor(value: string | undefined): string | null {
  if (!value) return null;
  if (value === "forbidden") return "You don't have access to that channel.";
  return "Something went wrong.";
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireDashboardSession();
  await ensureDefaultChannel();
  const channels = await getAuthorizedChannels(session.user.id, session.user.role);
  const selectedChannel = channels[0];

  const { error: errorParam } = await searchParams;
  const errorNotice = errorNoticeFor(errorParam);

  if (!selectedChannel) {
    return (
      <main className="dashboard-shell">
        <h1 className="dashboard-title">{productName}</h1>
        {errorNotice ? (
          <p className="error" role="alert" style={{ marginTop: 12 }}>
            {errorNotice}
          </p>
        ) : null}
        <p className="muted">No channel access has been assigned for this account.</p>
      </main>
    );
  }

  const recentEvents = await prisma.alertEvent.findMany({
    where: { channelId: selectedChannel.id },
    orderBy: { createdAt: "desc" },
    take: 12
  });

  const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? "https://<your-alerts-domain>";
  const overlayUrls = selectedChannel.overlayProfiles.map((profile) => ({
    label: profile.name,
    url: `${publicBaseUrl}/overlay/${profile.slug}?displayKey=${encodeURIComponent(profile.displayKey)}`
  }));

  return (
    <main className="dashboard-shell">
      {errorNotice ? (
        <p className="error" role="alert" style={{ marginTop: 12 }}>
          {errorNotice}
        </p>
      ) : null}
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">{productName}</h1>
          <p className="muted">Signed in as {session.user.email}. Managing {selectedChannel.name}.</p>
        </div>
        <div className="stack" style={{ flexDirection: "row", gap: 8 }}>
          <a className="button-secondary" href={`/dashboard/${encodeURIComponent(selectedChannel.slug)}/integrations`}>
            Settings → Integrations
          </a>
          <a className="button" href="/api/auth/signout">
            Sign out
          </a>
        </div>
      </header>

      <section className="grid">
        <div className="panel">
          <h2>Manual test alert</h2>
          <ManualAlertForm channelId={selectedChannel.id} />
        </div>

        <div className="panel">
          <h2>Overlay URLs</h2>
          <div className="url-list">
            {overlayUrls.map((overlay) => (
              <div key={overlay.label}>
                <strong>{overlay.label}</strong>
                <div className="url-item">{overlay.url}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Integrations</h2>
          <p className="muted">Ko-fi webhook ingestion is active when its verification token is configured.</p>
          <p className="muted">Twitch and YouTube are present as verified route stubs for future adapter work.</p>
        </div>

        <div className="panel">
          <h2>Template settings</h2>
          <p className="muted">Template editing will live here. v1 uses the default clean overlay presentation.</p>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Recent alerts</h2>
        {recentEvents.length === 0 ? (
          <p className="muted">No alerts have been received yet.</p>
        ) : (
          recentEvents.map((row) => {
            const event = toAlertEvent(row);
            return (
              <div className="event-row" key={event.id}>
                <strong>
                  {event.platform} / {event.type} from {event.displayName}
                </strong>
                <span className="muted">{new Date(event.createdAt).toLocaleString()}</span>
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
