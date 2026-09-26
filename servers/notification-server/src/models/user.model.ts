import { model, Schema, type Types } from "mongoose";

interface UserEntity { _id: Types.ObjectId; accountStatus: "active" | "suspended" | "disabled"; }

const schema = new Schema<UserEntity>({ accountStatus: { type: String, enum: ["active", "suspended", "disabled"], default: "active" } }, { collection: "users", strict: false, versionKey: false });

export const UserModel = model<UserEntity>("NotificationUser", schema, "users");
