import type {
  AdminAuthenticationResponse,
  AdminDashboardDto,
  AdminPermission,
  AdminUserListResponse,
} from "@terqivo/contracts";
import { Types } from "mongoose";

import { env } from "../../config/env.js";
import { AppError } from "../../core/errors.js";
import { getDatabaseStatus } from "../../lib/database.js";
import { getRedisStatus, redisClient } from "../../lib/redis.js";
import { encodeCursor, decodeCursor } from "../../utils/cursors.js";
import { verifyPasswordAgainstUserOrDummy } from "../auth/auth.security.js";
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

  return {
    users: page.map(toAdminUserListItemDto),
    nextCursor:
      hasMore && lastUser !== undefined
        ? encodeCursor({
            createdAt: lastUser.createdAt.toISOString(),
            id: lastUser._id.toString(),
          })
        : null,
  };
}

export async function initializeAdminModels(): Promise<void> {
  await AdminUserModel.init();
}
