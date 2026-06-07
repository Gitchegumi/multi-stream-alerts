import { NextResponse } from 'next/server';
import { canManageChannel, ensureDefaultChannel, prisma } from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';
import { normalizeCanvasSettings, serializeCanvasSettings } from '@/lib/canvas-schema';
import { randomBytes } from 'crypto';
import { z } from 'zod';

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

const createProfileSchema = z.object({
  name: z.string().min(1).max(80),
  duplicateFromSlug: z.string().min(1).max(80).optional(),
});

export type HandleGetArgs = {
  session: HandlerSession;
  channelSlug: string;
  deps?: HandlerDeps;
};

export type HandlePostArgs = {
  session: HandlerSession;
  channelSlug: string;
  body: unknown;
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
      url: `/overlay/${args.channelSlug}/${p.slug}?displayKey=${p.displayKey}`,
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

export async function POST(request: Request, context: Context) {
  const session = await requireDashboardSession();
  const params = await context.params;
  await ensureDefaultChannel();

  const result = await handlePost({
    session: session as unknown as HandlerSession,
    channelSlug: params.channelSlug,
    body: await request.json(),
  });

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

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

  const parsed = createProfileSchema.safeParse(args.body);
  if (!parsed.success) {
    return { status: 400, body: { error: 'Invalid canvas payload' } };
  }

  const source = parsed.data.duplicateFromSlug
    ? await deps.prisma.overlayProfile.findFirst({
        where: { channelId: channel.id, slug: parsed.data.duplicateFromSlug },
      })
    : null;
  if (parsed.data.duplicateFromSlug && !source) {
    return { status: 404, body: { error: 'Source canvas not found' } };
  }

  const slug = await uniqueProfileSlug(channel.id, parsed.data.name, deps);
  const profile = await deps.prisma.overlayProfile.create({
    data: {
      channelId: channel.id,
      name: parsed.data.name.trim(),
      slug,
      displayKey: deps.generateKey(),
      isActive: source?.isActive ?? true,
      settingsJson: (source?.settingsJson as object | null) ?? defaultCanvasSettings(),
    },
  });

  return {
    status: 201,
    body: { ok: true, profile },
    headers: { 'Cache-Control': 'no-store' },
  };
}

async function uniqueProfileSlug(channelId: string, name: string, deps: HandlerDeps) {
  const base = slugify(name) || 'canvas';
  let candidate = base;
  let suffix = 2;

  while (
    await deps.prisma.overlayProfile.findFirst({
      where: { channelId, slug: candidate },
      select: { id: true },
    })
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function defaultCanvasSettings() {
  return serializeCanvasSettings(normalizeCanvasSettings({}).settings);
}
