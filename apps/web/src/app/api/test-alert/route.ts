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

function buildSampleAlertData(
  platform: string,
  type: string,
): { message?: string; amount?: number; currency?: string } {
  if (type === 'tip' || type === 'superchat' || type === 'hypechat') {
    return { message: 'Thanks for the stream!', amount: 5, currency: 'USD' };
  }
  if (type === 'subscription' || type === 'membership' || type === 'gift') {
    return { message: 'Welcome to the channel!' };
  }
  if (type === 'raid') {
    return { message: 'Raid incoming!' };
  }
  return { message: 'This is a test alert from the dashboard.' };
}

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

  const sampleData = buildSampleAlertData(
    eventType?.platform ?? 'manual',
    eventType?.legacyType ?? 'test',
  );

  const event = await storeAndPublishAlertEvent({
    channelId: body.channelId,
    platform: eventType?.platform ?? 'manual',
    type: eventType?.legacyType ?? 'test',
    eventKey: eventType?.eventKey ?? 'manual.test',
    layoutIdOverride: body.layoutId,
    displayName: 'Test Viewer',
    message: body.message ?? sampleData.message,
    amount: sampleData.amount,
    currency: sampleData.currency,
    isPublic: body.isPublic ?? true,
    skipAccountTargeting: true,
    rawEventId: crypto.randomUUID(),
    rawPayload: { source: 'dashboard', test: true },
  });

  if (!event) {
    console.info('test alert suppressed', {
      channelId: body.channelId,
      eventKey: body.eventKey ?? 'manual.test',
      reason: 'disabled_or_unmapped',
    });
    return NextResponse.json({ error: 'Alert type is disabled or unmapped' }, { status: 409 });
  }

  console.info('test alert fired', { channelId: body.channelId, eventId: event.id });

  return NextResponse.json({ ok: true, event });
}
