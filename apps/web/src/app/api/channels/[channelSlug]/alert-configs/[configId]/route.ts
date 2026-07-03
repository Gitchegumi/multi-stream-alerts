import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { canManageChannel, ensureDefaultChannel, prisma } from '@multi-stream-alerts/database';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const configSchema = z.object({
  enabled: z.boolean().optional(),
  layoutId: z.string().min(1).nullable().optional(),
  displayName: z.string().max(120).nullable().optional(),
  templateText: z.string().max(500).nullable().optional(),
  durationMs: z.number().int().min(500).max(60000).nullable().optional(),
  volume: z.number().int().min(0).max(100).nullable().optional(),
  configJson: z
    .object({
      selectedLinkedAccountIds: z.array(z.string()).optional(),
    })
    .passthrough()
    .optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ channelSlug: string; configId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  await ensureDefaultChannel();
  const { channelSlug, configId } = await params;
  const channel = await prisma.channel.findUnique({ where: { slug: channelSlug } });
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const allowed = await canManageChannel(session.user.id, session.user.role, channel.id);
  if (!allowed) {
    return NextResponse.json({ error: 'Channel access denied' }, { status: 403 });
  }

  const body = configSchema.parse(await request.json());
  if (body.layoutId) {
    const layout = await prisma.workspaceAlertLayout.findFirst({
      where: { id: body.layoutId, channelId: channel.id },
    });
    if (!layout) {
      return NextResponse.json({ error: 'Layout not found' }, { status: 404 });
    }
  }

  const existing = await prisma.workspaceAlertConfig.findFirst({
    where: { id: configId, channelId: channel.id },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Alert config not found' }, { status: 404 });
  }

  // Build the update payload — only include fields that were provided
  // so we don't accidentally null out fields the caller didn't send.
  const updateData: Record<string, unknown> = {};
  if (body.enabled !== undefined) updateData.enabled = body.enabled;
  if (body.layoutId !== undefined) updateData.layoutId = body.layoutId;
  if (body.displayName !== undefined) updateData.displayName = body.displayName;
  if (body.templateText !== undefined) updateData.templateText = body.templateText;
  if (body.durationMs !== undefined) updateData.durationMs = body.durationMs;
  if (body.volume !== undefined) updateData.volume = body.volume;
  if (body.configJson !== undefined)
    updateData.configJson = JSON.parse(JSON.stringify(body.configJson));

  const config = await prisma.workspaceAlertConfig.update({
    where: { id: configId },
    data: updateData as never,
    include: { alertEventType: true, layout: true },
  });

  return NextResponse.json({ ok: true, config });
}
