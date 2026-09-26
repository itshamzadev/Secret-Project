import { model, Schema } from "mongoose";
import type { UserEntity } from "./user.types.js";

const schema = new Schema<UserEntity>({
  username: { type: String, required: true }, usernameNormalized: { type: String, required: true }, displayName: { type: String, required: true },
  email: { type: String, default: null }, emailNormalized: { type: String, default: null }, phone: { type: String, default: null }, phoneNormalized: { type: String, default: null },
  passwordHash: { type: String, required: true, select: false }, avatarUrl: { type: String, default: null }, avatarStorageKey: { type: String, default: null }, avatarMimeType: { type: String, default: null },
  bio: { type: String, default: null }, emailVerified: { type: Boolean, default: false }, phoneVerified: { type: Boolean, default: false },
  accountStatus: { type: String, enum: ["active", "suspended", "disabled"], default: "active" }, role: { type: String, enum: ["user", "moderator", "admin"], default: "user" },
  accountType: { type: String, enum: ["personal", "professional", "business"], default: "personal" }, userTier: { type: String, default: "normal" }, badges: { type: [String], default: [] }, lastSeenAt: { type: Date, default: null },
}, { collection: "users", timestamps: true, versionKey: false });

export const UserModel = model<UserEntity>("MessageUser", schema, "users");
