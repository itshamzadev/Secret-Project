import type { AdminPermission, AdminRole } from "@terqivo/contracts";
import type { HydratedDocument } from "mongoose";

export type AdminAccountStatus = "active" | "disabled";

export interface AdminUserEntity {
  emailNormalized: string;
  displayName: string;
  passwordHash: string;
  role: AdminRole;
  permissions: AdminPermission[];
  accountStatus: AdminAccountStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AdminUserDocument = HydratedDocument<AdminUserEntity>;

export interface AdminAuthContext {
  adminId: string;
  role: AdminRole;
  permissions: AdminPermission[];
}
