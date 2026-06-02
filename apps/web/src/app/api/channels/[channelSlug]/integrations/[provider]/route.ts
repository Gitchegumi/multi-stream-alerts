import { NextResponse } from "next/server";
import {
  canManageChannelCredentials,
  canViewChannel,
  clearAllChannelSecrets,
  clearChannelSecret,
  getChannelCredentialStatus,
  prisma,
  saveChannelCredentials,
  type IntegrationCredentialKey,
  type IntegrationProvider
} from "@multi-stream-alerts/database";
import { requireDashboardSession } from "@/lib/session";
import {
  deleteInputSchema,
  fieldToDbKey,
  getInputSchemaForProvider,
  isProvider
} from "@/lib/integration-credential-schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Per the integration-credentials service, the public field on the
// `twitch` provider's credential row. We surface a single field (the
// broadcasterId) because it's what webhook routing needs; no other
// public fields exist on the schema today.
const TWITCH_BROADCASTER_ID_PUBLIC_FIELD = "twitchBroadcasterId" as const;

type RouteParams = {
  channelSlug: string;
  provider: string;
};

/**
 * Dependencies for the pure handlers. The route file passes in the
 * real `prisma` + service imports; tests pass in mocks. Keep the
 * surface narrow — only what's used by the handlers.
 */
export type HandlerDeps = {
  prisma: typeof prisma;
  canViewChannel: typeof canViewChannel;
  canManageChannelCredentials: typeof canManageChannelCredentials;
  getChannelCredentialStatus: typeof getChannelCredentialStatus;
  saveChannelCredentials: typeof saveChannelCredentials;
  clearChannelSecret: typeof clearChannelSecret;
  clearAllChannelSecrets: typeof clearAllChannelSecrets;
};

const defaultDeps: HandlerDeps = {
  prisma,
  canViewChannel,
  canManageChannelCredentials,
  getChannelCredentialStatus,
  saveChannelCredentials,
  clearChannelSecret,
  clearAllChannelSecrets
};

export type HandlerSession = {
  user: { id: string; role: "admin" | "owner" | "editor" | "viewer" };
};

export type StatusResponseBody = {
  configured: Record<string, boolean>;
  public: { twitchBroadcasterId: string | null };
  isEnabled: boolean;
};

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export type HandleGetArgs = {
  session: HandlerSession;
  channelSlug: string;
  provider: string;
  deps?: HandlerDeps;
};

export async function handleGet(
  args: HandleGetArgs
): Promise<{ status: number; body?: unknown; headers?: Record<string, string> }> {
  const deps = args.deps ?? defaultDeps;

  if (!isProvider(args.provider)) {
    return { status: 400, body: { error: "Invalid provider" } };
  }

  const channel = await deps.prisma.channel.findUnique({ where: { slug: args.channelSlug } });
  if (!channel) {
    return { status: 404, body: { error: "Channel not found" } };
  }

  const canView = await deps.canViewChannel(args.session.user.id, args.session.user.role, channel.id);
  if (!canView) {
    return { status: 403, body: { error: "Forbidden" } };
  }

  const credentialStatus = await deps.getChannelCredentialStatus(channel.id, args.provider);

  // Defense-in-depth: even though getChannelCredentialStatus is documented
  // to never include ciphertext or plaintext, the API contract for this
  // route is "status shape only". Project to the explicit fields to
  // guarantee we never echo a leak in a future refactor.
  const body: StatusResponseBody = {
    configured: credentialStatus.configured as Record<string, boolean>,
    public: {
      twitchBroadcasterId: credentialStatus.public.twitchBroadcasterId
    },
    isEnabled: credentialStatus.isEnabled
  };

  return {
    status: 200,
    body,
    headers: { "Cache-Control": "no-store" }
  };
}

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

export type HandlePutArgs = {
  session: HandlerSession;
  channelSlug: string;
  provider: string;
  rawBody: unknown;
  deps?: HandlerDeps;
};

/**
 * Apply the PUT body: for each field, "" clears, non-empty saves. Mixed
 * behavior within a single PUT is supported. Returns the list of keys
 * that were written/cleared for audit logging.
 */
function applyPutBody(
  provider: IntegrationProvider,
  rawBody: Record<string, unknown>
): {
  secrets: Partial<Record<IntegrationCredentialKey, string>>;
  publicFields: { twitchBroadcasterId?: string | null };
  keysWritten: IntegrationCredentialKey[];
  keysCleared: IntegrationCredentialKey[];
} {
  const secrets: Partial<Record<IntegrationCredentialKey, string>> = {};
  const keysWritten: IntegrationCredentialKey[] = [];
  const keysCleared: IntegrationCredentialKey[] = [];
  let publicFields: { twitchBroadcasterId?: string | null } = {};

  for (const [field, value] of Object.entries(rawBody)) {
    if (value === undefined) continue;

    if (field === TWITCH_BROADCASTER_ID_PUBLIC_FIELD && provider === "twitch") {
      // Public field — never encrypted, never cleared via this path.
      // An empty string on the public field is treated as null (i.e. clear).
      publicFields.twitchBroadcasterId = value === "" ? null : String(value);
      continue;
    }

    // For all other fields, the value must be a string. The per-provider
    // Zod schema has already validated this; we re-assert for type safety.
    if (typeof value !== "string") {
      // The Zod schema should have rejected non-string values already.
      // Skip defensively rather than coercing.
      continue;
    }

    // Map the API field name + provider to the DB credential key.
    // Returns null for fields that aren't a known credential key for
    // this provider (e.g. unknown fields accidentally added by the
    // caller that snuck past the schema).
    const dbKey = fieldToDbKey(provider, field);
    if (!dbKey) {
      // Unknown field for this provider. Skip — the schema should
      // have rejected this already, but defend against drift.
      continue;
    }

    if (value === "") {
      keysCleared.push(dbKey);
    } else {
      secrets[dbKey] = value;
      keysWritten.push(dbKey);
    }
  }

  return { secrets, publicFields, keysWritten, keysCleared };
}

export async function handlePut(
  args: HandlePutArgs
): Promise<{ status: number; body?: unknown; headers?: Record<string, string> }> {
  const deps = args.deps ?? defaultDeps;

  if (!isProvider(args.provider)) {
    return { status: 400, body: { error: "Invalid provider" } };
  }

  const channel = await deps.prisma.channel.findUnique({ where: { slug: args.channelSlug } });
  if (!channel) {
    return { status: 404, body: { error: "Channel not found" } };
  }

  const canManage = await deps.canManageChannelCredentials(
    args.session.user.id,
    args.session.user.role,
    channel.id
  );
  if (!canManage) {
    return { status: 403, body: { error: "Forbidden" } };
  }

  const provider: IntegrationProvider = args.provider;

  // Body is validated as Record<string, unknown> so we can run the
  // per-provider Zod schema. Schema failures -> 400.
  const schema = getInputSchemaForProvider(provider);
  const parsed = schema.safeParse(args.rawBody);
  if (!parsed.success) {
    return { status: 400, body: { error: "Invalid payload", issues: parsed.error.issues } };
  }

  const validated = parsed.data as Record<string, unknown>;
  const { secrets, publicFields, keysWritten, keysCleared } = applyPutBody(provider, validated);

  // Clear first (sentinel: clearChannelSecret treats missing rows as a
  // no-op), then save the remaining non-empty values. This is the
  // correct ordering for a "mixed" PUT — it matches what the spec
  // calls out: a single PUT may save some and clear others.
  for (const key of keysCleared) {
    await deps.clearChannelSecret({
      channelId: channel.id,
      provider,
      key
    });
  }

  let newStatus;
  if (Object.keys(secrets).length > 0 || Object.keys(publicFields).length > 0) {
    newStatus = await deps.saveChannelCredentials({
      channelId: channel.id,
      provider,
      secrets,
      publicFields
    });
  } else {
    // Nothing to save. Read back the current status to return.
    newStatus = await deps.getChannelCredentialStatus(channel.id, provider);
  }

  // Audit log. channelSlug, provider, userId, and the key names — never
  // the values. The audit log is the only place we need this trail; the
  // route response is the status shape, not the saved values.
  console.info("credentials updated", {
    channelSlug: args.channelSlug,
    provider,
    userId: args.session.user.id,
    keysWritten,
    keysCleared
  });

  const body: StatusResponseBody = {
    configured: newStatus.configured as Record<string, boolean>,
    public: {
      twitchBroadcasterId: newStatus.public.twitchBroadcasterId
    },
    isEnabled: newStatus.isEnabled
  };

  return { status: 200, body, headers: { "Cache-Control": "no-store" } };
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

export type HandleDeleteArgs = {
  session: HandlerSession;
  channelSlug: string;
  provider: string;
  rawBody: unknown;
  deps?: HandlerDeps;
};

export async function handleDelete(
  args: HandleDeleteArgs
): Promise<{ status: number; body?: unknown }> {
  const deps = args.deps ?? defaultDeps;

  if (!isProvider(args.provider)) {
    return { status: 400, body: { error: "Invalid provider" } };
  }

  const channel = await deps.prisma.channel.findUnique({ where: { slug: args.channelSlug } });
  if (!channel) {
    return { status: 404, body: { error: "Channel not found" } };
  }

  const canManage = await deps.canManageChannelCredentials(
    args.session.user.id,
    args.session.user.role,
    channel.id
  );
  if (!canManage) {
    return { status: 403, body: { error: "Forbidden" } };
  }

  const provider: IntegrationProvider = args.provider;
  const parsed = deleteInputSchema.safeParse(args.rawBody);
  if (!parsed.success) {
    return { status: 400, body: { error: "Invalid delete payload" } };
  }

  const payload = parsed.data;
  if (payload.all) {
    await deps.clearAllChannelSecrets({ channelId: channel.id, provider });
    console.info("credentials cleared", {
      channelSlug: args.channelSlug,
      provider,
      userId: args.session.user.id,
      all: true
    });
    return { status: 204 };
  }

  await deps.clearChannelSecret({
    channelId: channel.id,
    provider,
    key: payload.key as IntegrationCredentialKey
  });
  console.info("credentials cleared", {
    channelSlug: args.channelSlug,
    provider,
    userId: args.session.user.id,
    key: payload.key
  });
  return { status: 204 };
}

// ---------------------------------------------------------------------------
// Next.js route handlers
// ---------------------------------------------------------------------------

type Context = {
  params: Promise<RouteParams>;
};

export async function GET(_request: Request, context: Context) {
  const session = await requireDashboardSession();
  const params = await context.params;
  const result = await handleGet({
    session: session as unknown as HandlerSession,
    channelSlug: params.channelSlug,
    provider: params.provider
  });
  return jsonResponse(result);
}

export async function PUT(request: Request, context: Context) {
  const session = await requireDashboardSession();
  const params = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await handlePut({
    session: session as unknown as HandlerSession,
    channelSlug: params.channelSlug,
    provider: params.provider,
    rawBody
  });
  return jsonResponse(result);
}

export async function DELETE(request: Request, context: Context) {
  const session = await requireDashboardSession();
  const params = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await handleDelete({
    session: session as unknown as HandlerSession,
    channelSlug: params.channelSlug,
    provider: params.provider,
    rawBody
  });
  return jsonResponse(result);
}

function jsonResponse(result: { status: number; body?: unknown; headers?: Record<string, string> }) {
  if (result.status === 204) {
    return new Response(null, { status: 204, headers: result.headers });
  }
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
