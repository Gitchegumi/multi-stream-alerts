import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { WorkspaceOverview } from '@/components/WorkspaceOverview';

export const dynamic = 'force-dynamic';

export default async function AdminWorkspacesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/signin?callbackUrl=/dashboard/admin/workspaces');
  }
  if (session.user.role !== 'admin') {
    redirect('/dashboard');
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? process.env.PUBLIC_BASE_URL ?? '';
  const apiUrl = baseUrl ? `${baseUrl}/api/admin/workspaces` : '/api/admin/workspaces';

  const res = await fetch(apiUrl, {
    headers: {
      cookie: '',
    },
  });

  if (!res.ok) {
    return (
      <main className="dashboard-shell">
        <h1 className="dashboard-title">Workspaces</h1>
        <p className="muted" style={{ marginTop: 16 }}>
          Failed to load workspace data.
        </p>
      </main>
    );
  }

  const data = (await res.json()) as {
    total: number;
    workspaces: Array<{
      id: string;
      name: string;
      slug: string;
      createdAt: string;
      updatedAt: string;
      owner: {
        id: string;
        email: string;
        displayName: string | null;
      } | null;
      memberCount: number;
    }>;
  };

  return (
    <main className="dashboard-shell">
      <WorkspaceOverview
        total={data.total}
        workspaces={data.workspaces.map((ws) => ({
          ...ws,
          createdAt: ws.createdAt,
          updatedAt: ws.updatedAt,
        }))}
      />
    </main>
  );
}
