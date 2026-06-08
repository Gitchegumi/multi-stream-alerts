import { NextResponse } from 'next/server';
import { prisma } from '@multi-stream-alerts/database';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  }
  if (session.user.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }
  return { userId: session.user.id };
}

export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const channels = await prisma.channel.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      updatedAt: true,
      ownerUserId: true,
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

  const workspaces = channels.map((channel) => ({
    id: channel.id,
    name: channel.name,
    slug: channel.slug,
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
    owner: channel.owner
      ? {
          id: channel.owner.id,
          email: channel.owner.email,
          displayName: channel.owner.displayName,
        }
      : null,
    memberCount: channel._count.memberships,
  }));

  return NextResponse.json({ total, workspaces });
}
