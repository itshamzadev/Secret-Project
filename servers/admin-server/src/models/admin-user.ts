import { model, Schema, type HydratedDocument } from "mongoose";

import { adminPermissions, adminRoles, type AdminPermission, type AdminRole } from "../modules/admin/contracts.js";

export interface AdminUserEntity {
  emailNormalized: string;
  displayName: string;
  passwordHash: string;
  role: AdminRole;
  permissions: AdminPermission[];
  accountStatus: "active" | "disabled";
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export type AdminUserDocument = HydratedDocument<AdminUserEntity>;

const schema = new Schema<AdminUserEntity>({
  emailNormalized: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  displayName: { type: String, required: true, trim: true, maxlength: 100 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: [...adminRoles], required: true },
  permissions: { type: [String], enum: [...adminPermissions], required: true, default: [] },
  accountStatus: { type: String, enum: ["active", "disabled"], required: true, default: "active" },
  lastLoginAt: { type: Date, default: null },
}, { collection: "admin_users", timestamps: true, versionKey: false });
schema.index({ emailNormalized: 1 }, { unique: true });
export const AdminUserModel = model<AdminUserEntity>("AdminUser", schema);
