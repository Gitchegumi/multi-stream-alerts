import { NextResponse } from 'next/server';
import { canManageChannel, ensureDefaultChannel, prisma } from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteParams = {
  channelSlug: string;
  profileSlug: string;
};

export type HandlerDeps = {
  prisma: typeof prisma;
  canManageChannel: typeof canManageChannel;
  generateKey: () => string;
};

const defaultDeps: HandlerDeps = {
  prisma,
  canManageChannel,
  generateKey: () => randomBytes(32).toString('hex'),
};

export type HandlerSession = {
  user: { id: string; role: 'admin' | 'owner' | 'editor' | 'viewer' };
};

export type HandlePostArgs = {
  session: HandlerSession;
  channelSlug: string;
  profileSlug: string;
  deps?: HandlerDeps;
};

export async function handlePost(
  args: HandlePostArgs,
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

  const existing = await deps.prisma.overlayProfile.findUnique({
    where: { channelId_slug: { channelId: channel.id, slug: args.profileSlug } },
  });
  if (!existing) {
    return { status: 404, body: { error: 'Profile not found' } };
  }

  const newKey = deps.generateKey();
  const updated = await deps.prisma.overlayProfile.update({
    where: { id: existing.id },
    data: { displayKey: newKey },
  });

  return {
    status: 200,
    body: { ok: true, displayKey: updated.displayKey },
    headers: { 'Cache-Control': 'no-store' },
  };
}

type Context = {
  params: Promise<RouteParams>;
};

export async function POST(_request: Request, context: Context) {
  const session = await requireDashboardSession();
  const params = await context.params;
  await ensureDefaultChannel();

  const result = await handlePost({
    session: session as unknown as HandlerSession,
    channelSlug: params.channelSlug,
    profileSlug: params.profileSlug,
  });

  if (result.status === 204) {
    return new Response(null, { status: 204, headers: result.headers });
  }
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
