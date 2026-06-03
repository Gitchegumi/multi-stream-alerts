import { NextResponse } from 'next/server';
import { canManageChannel, prisma } from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ channelSlug: string }> },
) {
  const session = await requireDashboardSession();
  const { channelSlug } = await params;

  const channel = await prisma.channel.findUnique({ where: { slug: channelSlug } });
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const allowed = await canManageChannel(session.user.id, session.user.role, channel.id);
  if (!allowed) {
    return NextResponse.json({ error: 'Channel access denied' }, { status: 403 });
  }

  const body = (await request.json()) as { name?: string };
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length < 1) {
    return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
  }

  const updated = await prisma.channel.update({
    where: { id: channel.id },
    data: { name: body.name.trim() },
  });

  return NextResponse.json({ ok: true, channel: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ channelSlug: string }> },
) {
  const session = await requireDashboardSession();
  const { channelSlug } = await params;

  const channel = await prisma.channel.findUnique({ where: { slug: channelSlug } });
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const allowed = await canManageChannel(session.user.id, session.user.role, channel.id);
  if (!allowed) {
    return NextResponse.json({ error: 'Channel access denied' }, { status: 403 });
  }

  await prisma.channel.delete({ where: { id: channel.id } });

  return NextResponse.json({ ok: true });
}
