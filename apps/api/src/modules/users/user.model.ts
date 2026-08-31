import { model, Schema } from "mongoose";

import type { UserEntity } from "./user.types.js";

const userSchema = new Schema<UserEntity>(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    usernameNormalized: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    emailNormalized: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      default: null,
      trim: true,
      maxlength: 32,
    },
    phoneNormalized: {
      type: String,
      default: null,
      trim: true,
      maxlength: 32,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    avatarUrl: {
      type: String,
      default: null,
      maxlength: 2048,
    },
    bio: {
      type: String,
      default: null,
      maxlength: 500,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    accountStatus: {
      type: String,
      enum: ["active", "suspended", "disabled"],
      default: "active",
    },
    role: {
      type: String,
      enum: ["user", "moderator", "admin"],
      default: "user",
    },
    lastSeenAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "users",
    timestamps: true,
    versionKey: false,
  },
);

userSchema.index({ usernameNormalized: 1 }, { unique: true });
userSchema.index(
  { emailNormalized: 1 },
  {
    unique: true,
    partialFilterExpression: { emailNormalized: { $type: "string" } },
  },
);
userSchema.index(
  { phoneNormalized: 1 },
  {
    unique: true,
    partialFilterExpression: { phoneNormalized: { $type: "string" } },
  },
);

export const UserModel = model<UserEntity>("User", userSchema);
