import { model, Schema, type Types } from "mongoose";

interface AuthSessionEntity { userId: Types.ObjectId; sessionId: string; revokedAt: Date | null; expiresAt: Date; }

const schema = new Schema<AuthSessionEntity>({ userId: { type: Schema.Types.ObjectId, required: true }, sessionId: { type: String, required: true }, revokedAt: { type: Date, default: null }, expiresAt: { type: Date, required: true } }, { collection: "auth_sessions", strict: false, versionKey: false });

export const AuthSessionModel = model<AuthSessionEntity>("NotificationAuthSession", schema, "auth_sessions");
