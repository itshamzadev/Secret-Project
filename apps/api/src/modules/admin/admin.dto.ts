import type { AdminUserDto, AdminUserListItemDto } from "@terqivo/contracts";
import type { Types } from "mongoose";

import type { AdminUserDocument } from "./admin-user.types.js";

type AdminUserListSource = {
  _id: Types.ObjectId;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  accountStatus: "active" | "suspended" | "disabled";
  role: "user" | "moderator" | "admin";
  createdAt: Date;
  lastSeenAt: Date | null;
};

export function toAdminUserDto(admin: AdminUserDocument): AdminUserDto {
  return {
    id: admin._id.toString(),
    email: admin.emailNormalized,
    displayName: admin.displayName,
    role: admin.role,
    permissions: admin.permissions,
    lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
    createdAt: admin.createdAt.toISOString(),
  };
}

export function toAdminUserListItemDto(
  user: AdminUserListSource,
): AdminUserListItemDto {
  return {
    id: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    accountStatus: user.accountStatus,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
  };
}
