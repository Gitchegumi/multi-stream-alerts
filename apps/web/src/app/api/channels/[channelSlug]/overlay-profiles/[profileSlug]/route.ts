import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canManageChannel, ensureDefaultChannel, prisma } from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const settingsSchema = z
  .object({
    width: z.number().int().min(320).max(7680).optional(),
    height: z.number().int().min(240).max(4320).optional(),
    background: z.enum(['transparent', 'dark']).optional(),
    alertEventKeys: z.array(z.string().min(1).max(120)).optional(),
  })
  .partial();

const updateProfileSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  slug: z.string().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
  settings: settingsSchema.optional(),
});

type Context = {
  params: Promise<{ channelSlug: string; profileSlug: string }>;
};

type HandlerResult = { status: number; body?: unknown; headers?: Record<string, string> };

export type HandlerSession = {
  user: { id: string; role: 'admin' | 'owner' | 'editor' | 'viewer' };
};

export type HandlerDeps = {
  prisma: typeof prisma;
  canManageChannel: typeof canManageChannel;
};

const defaultDeps: HandlerDeps = {
  prisma,
  canManageChannel,
};

export type HandlePatchArgs = {
  session: HandlerSession;
  channelSlug: string;
  profileSlug: string;
  body: unknown;
  deps?: HandlerDeps;
};

export type HandleDeleteArgs = {
  session: HandlerSession;
  channelSlug: string;
  profileSlug: string;
  deps?: HandlerDeps;
};

export async function PATCH(request: Request, context: Context) {
  const session = await requireDashboardSession();
  const { channelSlug, profileSlug } = await context.params;
  await ensureDefaultChannel();

  const result = await handlePatch({
    session: session as unknown as HandlerSession,
    channelSlug,
    profileSlug,
    body: await request.json(),
  });

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

export async function handlePatch(args: HandlePatchArgs): Promise<HandlerResult> {
  const deps = args.deps ?? defaultDeps;
  const auth = await authorize(args, deps);
  if ('error' in auth) return auth.error;

  const parsed = updateProfileSchema.safeParse(args.body);
  if (!parsed.success) {
    return { status: 400, body: { error: 'Invalid canvas payload' } };
  }

  const data = parsed.data;
  const nextSlug = data.slug ? slugify(data.slug) : undefined;
  if (data.slug && !nextSlug) {
    return { status: 400, body: { error: 'Canvas slug is invalid' } };
  }

  if (nextSlug && nextSlug !== auth.profile.slug) {
    const existing = await deps.prisma.overlayProfile.findFirst({
      where: { channelId: auth.channel.id, slug: nextSlug },
      select: { id: true },
    });
    if (existing) {
      return { status: 409, body: { error: 'Canvas slug already exists' } };
    }
  }

  const settingsJson = {
    ...readSettings(auth.profile.settingsJson),
    ...(data.settings ?? {}),
  };

  const profile = await deps.prisma.overlayProfile.update({
    where: { id: auth.profile.id },
    data: {
      name: data.name?.trim(),
      slug: nextSlug,
      isActive: data.isActive,
      settingsJson,
    },
  });

  return {
    status: 200,
    body: { ok: true, profile },
    headers: { 'Cache-Control': 'no-store' },
  };
}

export async function DELETE(_request: Request, context: Context) {
  const session = await requireDashboardSession();
  const { channelSlug, profileSlug } = await context.params;
  await ensureDefaultChannel();

  const result = await handleDelete({
    session: session as unknown as HandlerSession,
    channelSlug,
    profileSlug,
  });

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

export async function handleDelete(args: HandleDeleteArgs): Promise<HandlerResult> {
  const deps = args.deps ?? defaultDeps;
  const auth = await authorize(args, deps);
  if ('error' in auth) return auth.error;

  const count = await deps.prisma.overlayProfile.count({ where: { channelId: auth.channel.id } });
  if (count <= 1) {
    return { status: 409, body: { error: 'At least one canvas is required' } };
  }

  await deps.prisma.overlayProfile.delete({ where: { id: auth.profile.id } });
  return {
    status: 200,
    body: { ok: true },
    headers: { 'Cache-Control': 'no-store' },
  };
}

async function authorize(
  args: { session: HandlerSession; channelSlug: string; profileSlug: string },
  deps: HandlerDeps,
): Promise<
  | {
      channel: { id: string };
      profile: { id: string; slug: string; settingsJson: unknown };
    }
  | { error: HandlerResult }
> {
  const channel = await deps.prisma.channel.findUnique({ where: { slug: args.channelSlug } });
  if (!channel) {
    return { error: { status: 404, body: { error: 'Channel not found' } } };
  }

  const allowed = await deps.canManageChannel(
    args.session.user.id,
    args.session.user.role,
    channel.id,
  );
  if (!allowed) {
    return { error: { status: 403, body: { error: 'Channel access denied' } } };
  }

  const profile = await deps.prisma.overlayProfile.findFirst({
    where: { channelId: channel.id, slug: args.profileSlug },
  });
  if (!profile) {
    return { error: { status: 404, body: { error: 'Canvas not found' } } };
  }

  return { channel, profile };
}

function readSettings(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
