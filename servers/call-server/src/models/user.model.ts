import { model, Schema } from "mongoose";

import type { UserEntity } from "./user.types.js";

const schema = new Schema<UserEntity>({
  username: { type: String, required: true },
  displayName: { type: String, required: true },
  avatarUrl: { type: String, default: null },
  accountStatus: { type: String, enum: ["active", "suspended", "disabled"], default: "active" },
  badges: { type: [String], default: [] },
}, { collection: "users", strict: false, versionKey: false });

export const UserModel = model<UserEntity>("CallUser", schema, "users");
