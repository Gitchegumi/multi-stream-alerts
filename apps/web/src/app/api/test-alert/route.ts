import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import {
  canManageChannel,
  ensureDefaultChannel,
  prisma,
  storeAndPublishAlertEvent,
} from '@multi-stream-alerts/database';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const testAlertSchema = z.object({
  channelId: z.string().min(1),
  eventKey: z.string().min(1).optional(),
  layoutId: z.string().min(1).optional(),
  message: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  await ensureDefaultChannel();
  const body = testAlertSchema.parse(await request.json());
  const allowed = await canManageChannel(session.user.id, session.user.role, body.channelId);

  if (!allowed) {
    return NextResponse.json({ error: 'Channel access denied' }, { status: 403 });
  }

  const eventType = body.eventKey
    ? await prisma.alertEventType.findUnique({ where: { eventKey: body.eventKey } })
    : null;

  const event = await storeAndPublishAlertEvent({
    channelId: body.channelId,
    platform: eventType?.platform ?? 'manual',
    type: eventType?.legacyType ?? 'test',
    eventKey: eventType?.eventKey ?? 'manual.test',
    layoutIdOverride: body.layoutId,
    displayName: session.user.name ?? 'Dashboard user',
    message: body.message,
    isPublic: body.isPublic ?? true,
    rawEventId: crypto.randomUUID(),
    rawPayload: { source: 'dashboard' },
  });

  if (!event) {
    return NextResponse.json({ error: 'Alert type is disabled or unmapped' }, { status: 409 });
  }

  return NextResponse.json({ ok: true, event });
}
