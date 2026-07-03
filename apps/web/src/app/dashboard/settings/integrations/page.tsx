import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function LegacyIntegrationsPage() {
  // The old user-level integrations page has been consolidated into
  // the per-workspace Settings page. Redirect to the dashboard which
  // will route to the user's default channel, then they can navigate
  // to Settings > Integrations.
  redirect('/dashboard');
}
