import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { WorkspaceOverview } from '@/components/WorkspaceOverview';
import { prisma } from '@multi-stream-alerts/database';
import { dashboardShellClass } from '@/components/layout-styles';

export const dynamic = 'force-dynamic';

export default async function AdminWorkspacesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/signin?callbackUrl=/dashboard/admin/workspaces');
  }
  if (session.user.role !== 'admin') {
    redirect('/dashboard');
  }

  // Call Prisma directly instead of fetch() to an internal API route.
  // This avoids cookie forwarding issues and keeps the server component
  // self-contained.
  const channels = await prisma.channel.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      updatedAt: true,
      owner: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
      _count: {
        select: {
          memberships: true,
        },
      },
    },
  });

  const total = channels.length;

  const workspaces = channels.map((ch) => ({
    id: ch.id,
    name: ch.name,
    slug: ch.slug,
    createdAt: ch.createdAt.toISOString(),
    updatedAt: ch.updatedAt.toISOString(),
    owner: ch.owner
      ? {
          id: ch.owner.id,
          email: ch.owner.email,
          displayName: ch.owner.displayName,
        }
      : null,
    memberCount: ch._count.memberships,
  }));

  return (
    <main className={dashboardShellClass}>
      <WorkspaceOverview
        total={total}
        workspaces={workspaces.map((ws) => ({
          ...ws,
          createdAt: ws.createdAt,
          updatedAt: ws.updatedAt,
        }))}
      />
    </main>
  );
}
