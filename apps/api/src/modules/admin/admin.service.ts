import type {
  AdminAuthenticationResponse,
  AdminDashboardDto,
  AdminPermission,
  AdminUserListItemDto,
  AdminUserListResponse,
} from "@terqivo/contracts";
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
import { ConversationModel } from "../conversations/conversation.model.js";
import { MessageModel } from "../messages/message.model.js";
import { PushDeviceModel } from "../notifications/push-device.model.js";
import { UserModel } from "../users/user.model.js";
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
      toAdminUserListItemDto({
        ...user,
        appVersions: appVersionsByUser.get(user._id.toString()) ?? [],
      }),
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
