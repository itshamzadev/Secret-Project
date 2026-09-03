import { adminPermissions, adminRoles } from "@terqivo/contracts";
import { model, Schema } from "mongoose";

import type { AdminUserEntity } from "./admin-user.types.js";

const adminUserSchema = new Schema<AdminUserEntity>(
  {
    emailNormalized: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: [...adminRoles],
      required: true,
    },
    permissions: {
      type: [String],
      enum: [...adminPermissions],
      required: true,
      default: [],
    },
    accountStatus: {
      type: String,
      enum: ["active", "disabled"],
      required: true,
      default: "active",
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "admin_users",
    timestamps: true,
    versionKey: false,
  },
);

adminUserSchema.index({ emailNormalized: 1 }, { unique: true });

export const AdminUserModel = model<AdminUserEntity>(
  "AdminUser",
  adminUserSchema,
);
