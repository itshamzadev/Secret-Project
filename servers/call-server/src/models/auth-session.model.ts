import { model, Schema, type HydratedDocument, type Types } from "mongoose";

export interface AuthSessionEntity {
  userId: Types.ObjectId;
  sessionId: string;
  revokedAt: Date | null;
  expiresAt: Date;
}

export type AuthSessionDocument = HydratedDocument<AuthSessionEntity>;

const schema = new Schema<AuthSessionEntity>({
  userId: { type: Schema.Types.ObjectId, required: true },
  sessionId: { type: String, required: true },
  revokedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
}, { collection: "auth_sessions", strict: false, versionKey: false });

export const AuthSessionModel = model<AuthSessionEntity>("CallAuthSession", schema, "auth_sessions");
