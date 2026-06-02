import type { UserRole } from "@prisma/client";
import { prisma } from "./client";

const editableRoles: UserRole[] = ["admin", "owner", "editor"];
// Credentials grant platform power (Twitch EventSub subscription, YouTube
// OAuth, Ko-fi webhook validation, etc.), so the manage-credentials
// allowlist is tighter than the general edit allowlist: only admins
// (unconditional) and channel owners. Editors and viewers cannot.
const credentialManageRoles: UserRole[] = ["admin", "owner"];

export async function getAuthorizedChannels(userId: string, userRole: UserRole) {
  await ensureInitialAdminChannelMembership(userId, userRole);

  if (userRole === "admin") {
    return prisma.channel.findMany({ orderBy: { createdAt: "asc" }, include: { overlayProfiles: true } });
  }

  const memberships = await prisma.channelMembership.findMany({
    where: { userId },
    include: { channel: { include: { overlayProfiles: true } } },
    orderBy: { createdAt: "asc" }
  });

  return memberships.map((membership) => membership.channel);
}

export async function canManageChannel(userId: string, userRole: UserRole, channelId: string) {
  if (userRole === "admin") {
    return true;
  }

  const membership = await prisma.channelMembership.findUnique({
    where: { channelId_userId: { channelId, userId } }
  });

  return Boolean(membership && editableRoles.includes(membership.role));
}

export async function canManageChannelCredentials(userId: string, userRole: UserRole, channelId: string) {
  if (userRole === "admin") {
    return true;
  }

  const membership = await prisma.channelMembership.findUnique({
    where: { channelId_userId: { channelId, userId } }
  });

  return Boolean(membership && credentialManageRoles.includes(membership.role));
}

export async function canViewChannel(userId: string, userRole: UserRole, channelId: string) {
  if (userRole === "admin") {
    return true;
  }

  const membership = await prisma.channelMembership.findUnique({
    where: { channelId_userId: { channelId, userId } }
  });

  return Boolean(membership);
}

async function ensureInitialAdminChannelMembership(userId: string, userRole: UserRole) {
  if (userRole !== "admin") {
    return;
  }

  const defaultChannel = await prisma.channel.findUnique({ where: { slug: process.env.DEFAULT_CHANNEL_SLUG } });
  if (!defaultChannel) {
    return;
  }

  await prisma.channel.updateMany({
    where: { id: defaultChannel.id, ownerUserId: null },
    data: { ownerUserId: userId }
  });

  await prisma.channelMembership.upsert({
    where: { channelId_userId: { channelId: defaultChannel.id, userId } },
    update: { role: "owner" },
    create: { channelId: defaultChannel.id, userId, role: "owner" }
  });
}
