import { NextResponse } from 'next/server';
import { canManageChannel, ensureDefaultChannel, prisma } from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteParams = {
  channelSlug: string;
};

type ProfileListItem = {
  id: string;
  name: string;
  slug: string;
  displayKey: string;
  isActive: boolean;
  url: string;
};

export type HandlerDeps = {
  prisma: typeof prisma;
  canManageChannel: typeof canManageChannel;
};

const defaultDeps: HandlerDeps = {
  prisma,
  canManageChannel,
};

export type HandlerSession = {
  user: { id: string; role: 'admin' | 'owner' | 'editor' | 'viewer' };
};

export type HandleGetArgs = {
  session: HandlerSession;
  channelSlug: string;
  deps?: HandlerDeps;
};

export async function handleGet(
  args: HandleGetArgs,
): Promise<{ status: number; body?: unknown; headers?: Record<string, string> }> {
  const deps = args.deps ?? defaultDeps;

  const channel = await deps.prisma.channel.findUnique({ where: { slug: args.channelSlug } });
  if (!channel) {
    return { status: 404, body: { error: 'Channel not found' } };
  }

  const allowed = await deps.canManageChannel(
    args.session.user.id,
    args.session.user.role,
    channel.id,
  );
  if (!allowed) {
    return { status: 403, body: { error: 'Channel access denied' } };
  }

  const profiles = await deps.prisma.overlayProfile.findMany({
    where: { channelId: channel.id },
    orderBy: { createdAt: 'asc' },
  });

  const body: { profiles: ProfileListItem[] } = {
    profiles: profiles.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      displayKey: p.displayKey,
      isActive: p.isActive,
      url: `/overlay/${p.slug}?displayKey=${p.displayKey}`,
    })),
  };

  return {
    status: 200,
    body,
    headers: { 'Cache-Control': 'no-store' },
  };
}

type Context = {
  params: Promise<RouteParams>;
};

export async function GET(_request: Request, context: Context) {
  const session = await requireDashboardSession();
  const params = await context.params;
  await ensureDefaultChannel();

  const result = await handleGet({
    session: session as unknown as HandlerSession,
    channelSlug: params.channelSlug,
  });

  if (result.status === 204) {
    return new Response(null, { status: 204, headers: result.headers });
  }
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
