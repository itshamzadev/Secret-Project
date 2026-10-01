import argon2 from "argon2";
import { Types } from "mongoose";

import type { AdminServerConfig } from "../../config/env.js";
import { AppError } from "../../core/errors.js";
import { createAdminAccessToken } from "../../auth/admin-jwt.js";
import { AdminUserModel } from "../../models/admin-user.js";
import type { AdminAuthenticationResponse, AdminChannelListResponse, AdminDashboardDto, AdminGroupListResponse, AdminUserListResponse } from "./contracts.js";
import { toAdminUserDto } from "./dto.js";
import type { AdminLoginInput, AdminUsersQuery } from "./validation.js";
import { disableUser, getUserStats, listUsers, updateUserBadges, updateUserPassword, updateUserStatus, updateUserTier } from "../../clients/auth.client.js";
import { getMessageStats, listChannels, listGroups, updateChannelBadges, updateGroupBadges } from "../../clients/message.client.js";
import { getCallStats } from "../../clients/call.client.js";
import { getNotificationStats } from "../../clients/notification.client.js";
import { normalizeAdminEmail } from "./email.js";

function invalidCredentials(): AppError { return new AppError({ code: "INVALID_ADMIN_CREDENTIALS", message: "The administrative credentials are invalid.", statusCode: 401 }); }
const dummyHash = "$argon2id$v=19$m=65536,p=4,t=3$YJ5cYMGIjbvI2aW15hnzlQ$3DmlwtIF3Ee/Jx0r7UJwHVROMLF4oRMpEQbZgyOcuXg";

export async function loginAdmin(config: AdminServerConfig, input: AdminLoginInput): Promise<AdminAuthenticationResponse> {
  const admin = await AdminUserModel.findOne({ emailNormalized: normalizeAdminEmail(input.email) }).select("+passwordHash").exec();
  const valid = await argon2.verify(admin?.passwordHash ?? dummyHash, input.password).catch(() => false);
  if (!valid || admin === null || admin.accountStatus !== "active") throw invalidCredentials();
  admin.lastLoginAt = new Date();
  await admin.save();
  return { admin: toAdminUserDto(admin), accessToken: await createAdminAccessToken(config, admin._id.toString()), accessTokenExpiresIn: config.ADMIN_ACCESS_TOKEN_TTL_SECONDS };
}

export async function getAdminById(adminId: string) {
  const admin = Types.ObjectId.isValid(adminId) ? await AdminUserModel.findById(adminId).exec() : null;
  if (admin === null || admin.accountStatus !== "active") throw new AppError({ code: "ADMIN_NOT_FOUND", message: "The administrator was not found.", statusCode: 401 });
  return admin;
}

export async function listAdminUsers(config: AdminServerConfig, query: AdminUsersQuery): Promise<AdminUserListResponse> {
  const result = await listUsers(config, query);
  return { users: result.data.users.map((user) => ({ id: user.id, username: user.username, displayName: user.displayName, email: user.email, phone: user.phone, avatarUrl: user.avatarUrl, accountStatus: user.accountStatus, role: user.role, accountType: user.accountType, userTier: user.userTier, badges: user.badges, createdAt: user.createdAt, lastSeenAt: user.lastSeenAt, appVersions: user.appVersions })), nextCursor: result.data.nextCursor };
}

export async function listAdminGroups(config: AdminServerConfig): Promise<AdminGroupListResponse> {
  return (await listGroups(config)).data;
}

export async function listAdminChannels(config: AdminServerConfig): Promise<AdminChannelListResponse> {
  return (await listChannels(config)).data;
}

export async function getDashboard(config: AdminServerConfig, database: "connected" | "disconnected", redis: "connected" | "disconnected", countOnlineUsers: () => Promise<number> = async () => 0): Promise<AdminDashboardDto> {
  const [users, messages, calls, push] = await Promise.all([getUserStats(config), getMessageStats(config), getCallStats(config), getNotificationStats(config)]);
  return { users: { ...users.data.users, online: await countOnlineUsers() }, conversations: messages.data.conversations, messages: messages.data.messages, calls: calls.data.calls, pushDevices: push.data.pushDevices, health: { database, redis, uptime: process.uptime() } };
}

export async function changePassword(config: AdminServerConfig, userId: string, password: string) { return (await updateUserPassword(config, userId, password)).data; }
export async function setStatus(config: AdminServerConfig, userId: string, status: string) { return (await updateUserStatus(config, userId, status)).data; }
export async function setTier(config: AdminServerConfig, userId: string, userTier: string) { return (await updateUserTier(config, userId, userTier)).data; }
export async function setBadges(config: AdminServerConfig, userId: string, badges: string[]) { return (await updateUserBadges(config, userId, badges)).data; }
export async function deleteUser(config: AdminServerConfig, userId: string) { return (await disableUser(config, userId)).data; }
export async function setGroupBadges(config: AdminServerConfig, groupId: string, badges: string[]) { return (await updateGroupBadges(config, groupId, badges)).data; }
export async function setChannelBadges(config: AdminServerConfig, channelId: string, badges: string[]) { return (await updateChannelBadges(config, channelId, badges)).data; }
