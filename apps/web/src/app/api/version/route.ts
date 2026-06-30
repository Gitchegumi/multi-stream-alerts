import { NextResponse } from 'next/server';
import { requireDashboardSession } from '@/lib/session';
import { getVersionStatus } from '@/lib/update-check';

export const dynamic = 'force-dynamic';

export async function GET() {
  await requireDashboardSession();

  const status = await getVersionStatus();

  return NextResponse.json(status);
}
