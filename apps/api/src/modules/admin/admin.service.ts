import type {
  AdminAuthenticationResponse,
  AdminChannelListResponse,
  AdminDashboardDto,
  AdminGroupListResponse,
  AdminPermission,
  AdminUserListItemDto,
  AdminUserListResponse,
} from "@terqivo/contracts";
import type { BadgeType } from "@terqivo/contracts";
import { Types } from "mongoose";

import { env } from "../../config/env.js";
import { AppError } from "../../core/errors.js";
import { getDatabaseStatus } from "../../lib/database.js";
import { getRedisStatus, redisClient } from "../../lib/redis.js";
import { encodeCursor, decodeCursor } from "../../utils/cursors.js";
import {
  hashPassword,
  verifyPasswordAgainstUserOrDummy,
} from "../auth/auth.security.js";
import { AuthSessionModel } from "../auth/auth-session.model.js";
import { revokeAllSessionsForUser } from "../auth/auth.service.js";
import { CallModel } from "../calls/call.model.js";
import { ChannelModel, ChannelPostModel } from "../channels/channel.model.js";
import { toChannelPostDto } from "../channels/channel.dto.js";
import { ConversationModel } from "../conversations/conversation.model.js";
import { GroupModel } from "../groups/group.model.js";
import { MessageModel } from "../messages/message.model.js";
import { PushDeviceModel } from "../notifications/push-device.model.js";
import { UserModel } from "../users/user.model.js";
import { toContactUserDto } from "../contacts/contact.dto.js";
import { AdminUserModel } from "./admin-user.model.js";
import { toAdminUserDto, toAdminUserListItemDto } from "./admin.dto.js";
import { createAdminAccessToken } from "./admin.tokens.js";
import type { AdminLoginInput, AdminUsersQuery } from "./admin.validation.js";
import type {
  AdminAuthContext,
  AdminUserDocument,
} from "./admin-user.types.js";

function invalidAdminCredentials(): AppError {
  return new AppError({
    code: "INVALID_ADMIN_CREDENTIALS",
    message: "The administrative credentials are invalid.",
    statusCode: 401,
  });
}

function adminNotFound(): AppError {
  return new AppError({
    code: "ADMIN_NOT_FOUND",
    message: "The administrator was not found.",
    statusCode: 401,
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function loginAdmin(
  input: AdminLoginInput,
): Promise<AdminAuthenticationResponse> {
  const admin = await AdminUserModel.findOne({
    emailNormalized: normalizeEmail(input.email),
  })
    .select("+passwordHash")
    .exec();
  const validPassword = await verifyPasswordAgainstUserOrDummy(
    input.password,
    admin?.passwordHash ?? null,
  );

  if (!validPassword || admin === null || admin.accountStatus !== "active") {
    throw invalidAdminCredentials();
  }

  admin.lastLoginAt = new Date();
  await admin.save();

  return {
    admin: toAdminUserDto(admin),
    accessToken: await createAdminAccessToken(admin._id.toString()),
    accessTokenExpiresIn: env.ADMIN_ACCESS_TOKEN_TTL_SECONDS,
  };
}

export async function getAdminById(
  adminId: string,
): Promise<AdminUserDocument> {
  if (!Types.ObjectId.isValid(adminId)) throw adminNotFound();
  const admin = await AdminUserModel.findById(adminId).exec();
  if (admin === null || admin.accountStatus !== "active") {
    throw adminNotFound();
  }
  return admin;
}

export async function getAdminAuthContext(
  adminId: string,
): Promise<AdminAuthContext> {
  const admin = await getAdminById(adminId);
  return {
    adminId: admin._id.toString(),
    role: admin.role,
    permissions: admin.permissions,
  };
}

export function hasAdminPermission(
  context: AdminAuthContext,
  permission: AdminPermission,
): boolean {
  return (
    context.role === "super_admin" || context.permissions.includes(permission)
  );
}

async function countOnlineUsers(): Promise<number> {
  if (!redisClient.isReady) return 0;
  let count = 0;
  for await (const keys of redisClient.scanIterator({
    MATCH: "presence:user:*:connections",
    COUNT: 100,
  })) {
    for (const key of keys) {
      if ((await redisClient.sCard(key)) > 0) count += 1;
    }
  }
  return count;
}

export async function getAdminDashboard(): Promise<AdminDashboardDto> {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const [
    totalUsers,
    activeUsers,
    suspendedUsers,
    disabledUsers,
    onlineUsers,
    totalConversations,
    totalMessages,
    messagesToday,
    totalCalls,
    missedCalls,
    enabledPushDevices,
  ] = await Promise.all([
    UserModel.countDocuments().exec(),
    UserModel.countDocuments({ accountStatus: "active" }).exec(),
    UserModel.countDocuments({ accountStatus: "suspended" }).exec(),
    UserModel.countDocuments({ accountStatus: "disabled" }).exec(),
    countOnlineUsers(),
    ConversationModel.countDocuments().exec(),
    MessageModel.countDocuments().exec(),
    MessageModel.countDocuments({ createdAt: { $gte: startOfToday } }).exec(),
    CallModel.countDocuments().exec(),
    CallModel.countDocuments({ status: "missed" }).exec(),
    PushDeviceModel.countDocuments({ enabled: true }).exec(),
  ]);

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      suspended: suspendedUsers,
      disabled: disabledUsers,
      online: onlineUsers,
    },
    conversations: { total: totalConversations },
    messages: { total: totalMessages, today: messagesToday },
    calls: { total: totalCalls, missed: missedCalls },
    pushDevices: { enabled: enabledPushDevices },
    health: {
      database: getDatabaseStatus(),
      redis: getRedisStatus(),
      uptime: process.uptime(),
    },
  };
}

export async function listAdminUsers(
  query: AdminUsersQuery,
): Promise<AdminUserListResponse> {
  const cursor = decodeCursor(query.cursor);
  let userQuery = UserModel.find();

  if (query.status !== undefined) {
    userQuery = userQuery.where("accountStatus").equals(query.status);
  }
  if (query.role !== undefined) {
    userQuery = userQuery.where("role").equals(query.role);
  }

  if (query.search !== undefined) {
    const escapedSearch = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    userQuery = userQuery.or([
      { usernameNormalized: { $regex: escapedSearch, $options: "i" } },
      { emailNormalized: { $regex: escapedSearch, $options: "i" } },
      { displayName: { $regex: escapedSearch, $options: "i" } },
    ]);
  }

  if (cursor !== null) {
    if (!Types.ObjectId.isValid(cursor.id)) {
      throw new AppError({
        code: "INVALID_CURSOR",
        message: "The pagination cursor is invalid.",
        statusCode: 400,
      });
    }
    const cursorDate = new Date(cursor.createdAt);
    if (Number.isNaN(cursorDate.getTime())) {
      throw new AppError({
        code: "INVALID_CURSOR",
        message: "The pagination cursor is invalid.",
        statusCode: 400,
      });
    }
    userQuery = userQuery.and([
      {
        $or: [
          { createdAt: { $lt: cursorDate } },
          {
            createdAt: cursorDate,
            _id: { $lt: new Types.ObjectId(cursor.id) },
          },
        ],
      },
    ]);
  }

  const users = await userQuery
    .select({
      username: 1,
      displayName: 1,
      email: 1,
      phone: 1,
      accountStatus: 1,
      role: 1,
      accountType: 1,
      userTier: 1,
      badges: 1,
      createdAt: 1,
      lastSeenAt: 1,
    })
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .exec();
  const hasMore = users.length > query.limit;
  const page = hasMore ? users.slice(0, query.limit) : users;
  const lastUser = page.at(-1);

  const sessions = await AuthSessionModel.find({
    userId: { $in: page.map((user) => user._id) },
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .select({
      userId: 1,
      appVersion: 1,
      appBuild: 1,
      platform: 1,
      deviceName: 1,
      lastUsedAt: 1,
    })
    .sort({ lastUsedAt: -1 })
    .lean<
      Array<{
        userId: Types.ObjectId;
        appVersion?: string | null;
        appBuild?: number | null;
        platform:
          "web" | "android" | "ios" | "windows" | "macos" | "linux" | "unknown";
        deviceName: string;
        lastUsedAt: Date;
      }>
    >()
    .exec();
  const appVersionsByUser = new Map<
    string,
    AdminUserListItemDto["appVersions"]
  >();
  for (const session of sessions) {
    const userId = session.userId.toString();
    const versions = appVersionsByUser.get(userId) ?? [];
    versions.push({
      version: session.appVersion ?? null,
      build: session.appBuild ?? null,
      platform: session.platform,
      deviceName: session.deviceName,
      lastUsedAt: session.lastUsedAt.toISOString(),
      active: true,
    });
    appVersionsByUser.set(userId, versions);
  }

  return {
    users: page.map((user) =>
      toAdminUserListItemDto(
        user,
        appVersionsByUser.get(user._id.toString()) ?? [],
      ),
    ),
    nextCursor:
      hasMore && lastUser !== undefined
        ? encodeCursor({
            createdAt: lastUser.createdAt.toISOString(),
            id: lastUser._id.toString(),
          })
        : null,
  };
}

export async function listAdminGroups(): Promise<AdminGroupListResponse> {
  const groups = await GroupModel.find().sort({ updatedAt: -1, _id: -1 }).limit(500).exec();
  const ids = [...new Set(groups.flatMap((group) => [group.ownerId, ...group.memberIds].map((id) => id.toString())))];
  const users = await UserModel.find({ _id: { $in: ids } }).exec();
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  return {
    groups: groups.map((group) => ({
      id: group._id.toString(),
      name: group.name,
      description: group.description,
      avatarUrl: group.avatarUrl,
      badges: group.badges ?? [],
      owner: usersById.has(group.ownerId.toString())
        ? toContactUserDto(usersById.get(group.ownerId.toString())!)
        : null,
      admins: usersById.has(group.ownerId.toString())
        ? [toContactUserDto(usersById.get(group.ownerId.toString())!)]
        : [],
      members: group.memberIds.flatMap((memberId) => {
        const member = usersById.get(memberId.toString());
        return member === undefined ? [] : [toContactUserDto(member)];
      }),
      memberCount: group.memberIds.length,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    })),
  };
}

export async function listAdminChannels(): Promise<AdminChannelListResponse> {
  const channels = await ChannelModel.find().sort({ updatedAt: -1, _id: -1 }).limit(500).exec();
  const posts = await ChannelPostModel.find({
    channelId: { $in: channels.map((channel) => channel._id) },
  }).sort({ createdAt: -1, _id: -1 }).limit(1000).exec();
  const ids = [
    ...new Set(
      channels.flatMap((channel) => [channel.ownerId, ...channel.followerIds]).concat(posts.map((post) => post.authorId)).map((id) => id.toString()),
    ),
  ];
  const users = await UserModel.find({ _id: { $in: ids } }).exec();
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  const latestPosts = new Map<string, typeof posts[number]>();
  for (const post of posts) {
    if (!latestPosts.has(post.channelId.toString())) latestPosts.set(post.channelId.toString(), post);
  }
  return {
    channels: channels.map((channel) => {
      const owner = usersById.get(channel.ownerId.toString());
      const latest = latestPosts.get(channel._id.toString());
      const author = latest === undefined ? undefined : usersById.get(latest.authorId.toString());
      return {
        id: channel._id.toString(),
        name: channel.name,
        handle: channel.handle,
        description: channel.description,
        avatarUrl: channel.avatarUrl,
        badges: channel.badges ?? [],
        owner: owner === undefined ? null : toContactUserDto(owner),
        followers: channel.followerIds.flatMap((followerId) => {
          const follower = usersById.get(followerId.toString());
          return follower === undefined ? [] : [toContactUserDto(follower)];
        }),
        followerCount: channel.followerIds.length,
        latestPost: latest === undefined || author === undefined ? null : toChannelPostDto(latest, author),
        createdAt: channel.createdAt.toISOString(),
        updatedAt: channel.updatedAt.toISOString(),
      };
    }),
  };
}

function userNotFound(): AppError {
  return new AppError({
    code: "ADMIN_USER_NOT_FOUND",
    message: "The user was not found.",
    statusCode: 404,
  });
}

async function getManagedUser(userId: string) {
  if (!Types.ObjectId.isValid(userId)) throw userNotFound();
  const user = await UserModel.findById(userId).exec();
  if (user === null) throw userNotFound();
  return user;
}

export async function changeAdminUserPassword(
  userId: string,
  password: string,
): Promise<{ updated: true; revokedSessions: number }> {
  const user = await getManagedUser(userId);
  user.passwordHash = await hashPassword(password);
  await user.save();
  const revokedSessions = await revokeAllSessionsForUser(
    userId,
    "admin_password_change",
  );
  return { updated: true, revokedSessions };
}

export async function setAdminUserStatus(
  userId: string,
  status: "active" | "suspended" | "disabled",
): Promise<{ updated: true; status: typeof status; revokedSessions: number }> {
  const user = await getManagedUser(userId);
  user.accountStatus = status;
  await user.save();
  const revokedSessions =
    status === "active"
      ? 0
      : await revokeAllSessionsForUser(userId, "account_status_change");
  return { updated: true, status, revokedSessions };
}

export async function setAdminUserTier(
  userId: string,
  userTier: "normal" | "special" | "special_pro" | "ultra_special",
): Promise<{ updated: true; userTier: typeof userTier }> {
  const user = await getManagedUser(userId);
  user.userTier = userTier;
  await user.save();
  return { updated: true, userTier };
}

export async function setAdminUserBadges(
  userId: string,
  badges: BadgeType[],
): Promise<{ updated: true; badges: BadgeType[] }> {
  const user = await getManagedUser(userId);
  user.badges = badges;
  await user.save();
  return { updated: true, badges: user.badges };
}

function adminGroupNotFound(): AppError {
  return new AppError({
    code: "ADMIN_GROUP_NOT_FOUND",
    message: "The group was not found.",
    statusCode: 404,
  });
}

function adminChannelNotFound(): AppError {
  return new AppError({
    code: "ADMIN_CHANNEL_NOT_FOUND",
    message: "The channel was not found.",
    statusCode: 404,
  });
}

export async function setAdminGroupBadges(
  groupId: string,
  badges: BadgeType[],
): Promise<{ updated: true; badges: BadgeType[] }> {
  if (!Types.ObjectId.isValid(groupId)) throw adminGroupNotFound();
  const group = await GroupModel.findById(groupId).exec();
  if (group === null) throw adminGroupNotFound();
  group.badges = badges;
  await group.save();
  return { updated: true, badges: group.badges };
}

export async function setAdminChannelBadges(
  channelId: string,
  badges: BadgeType[],
): Promise<{ updated: true; badges: BadgeType[] }> {
  if (!Types.ObjectId.isValid(channelId)) throw adminChannelNotFound();
  const channel = await ChannelModel.findById(channelId).exec();
  if (channel === null) throw adminChannelNotFound();
  channel.badges = badges;
  await channel.save();
  return { updated: true, badges: channel.badges };
}

export async function deleteAdminUser(
  userId: string,
): Promise<{ deleted: true; revokedSessions: number }> {
  const user = await getManagedUser(userId);
  user.accountStatus = "disabled";
  await user.save();
  const revokedSessions = await revokeAllSessionsForUser(
    userId,
    "account_status_change",
  );
  return { deleted: true, revokedSessions };
}

export async function initializeAdminModels(): Promise<void> {
  await AdminUserModel.init();
}
