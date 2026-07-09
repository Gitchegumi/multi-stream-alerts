import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma, listInviteCodes } from '@multi-stream-alerts/database';
import { InviteManager } from '@/components/InviteManager';
import { dashboardShellClass } from '@/components/layout-styles';

export const dynamic = 'force-dynamic';

export default async function AdminInvitesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/signin?callbackUrl=/dashboard/admin/invites');
  }
  if (session.user.role !== 'admin') {
    redirect('/dashboard');
  }

  const codes = await listInviteCodes();
  const redemptions = await prisma.inviteCodeRedemption.findMany({
    orderBy: { redeemedAt: 'desc' },
    take: 200,
    include: { user: { select: { email: true, displayName: true } } },
  });

  return (
    <main className={dashboardShellClass}>
      <InviteManager
        initialCodes={codes.map((code) => ({
          ...code,
          expiresAt: code.expiresAt ? code.expiresAt.toISOString() : null,
          createdAt: code.createdAt.toISOString(),
          identityProviderInvite: code.identityProviderInvite
            ? {
                ...code.identityProviderInvite,
                expiresAt: code.identityProviderInvite.expiresAt
                  ? code.identityProviderInvite.expiresAt.toISOString()
                  : null,
                usedAt: code.identityProviderInvite.usedAt
                  ? code.identityProviderInvite.usedAt.toISOString()
                  : null,
                createdAt: code.identityProviderInvite.createdAt.toISOString(),
              }
            : null,
        }))}
        initialRedemptions={redemptions.map((r: (typeof redemptions)[0]) => ({
          id: r.id,
          inviteCodeId: r.inviteCodeId,
          redeemedAt: r.redeemedAt.toISOString(),
          user: { email: r.user.email, displayName: r.user.displayName },
        }))}
      />
    </main>
  );
}
