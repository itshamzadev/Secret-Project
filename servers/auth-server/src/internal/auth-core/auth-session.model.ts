import { clientPlatforms, type ClientPlatform } from "./contracts.js";
import mongoose, {
  model,
  Schema,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

export type RevokeReason =
  | "logout"
  | "logout_all"
  | "refresh_token_reuse"
  | "account_status_change"
  | "admin_password_change";
export interface AuthSessionEntity {
  userId: Types.ObjectId;
  sessionId: string;
  refreshTokenHash: string;
  deviceId: string | null;
  deviceName: string;
  platform: ClientPlatform;
  appVersion: string | null;
  appBuild: number | null;
  userAgent: string;
  ipAddress: string;
  createdAt: Date;
  lastUsedAt: Date;
  lastRefreshAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: RevokeReason | null;
}
export type AuthSessionDocument = HydratedDocument<AuthSessionEntity>;

const authSessionSchema = new Schema<AuthSessionEntity>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sessionId: { type: String, required: true, unique: true, index: true },
    refreshTokenHash: { type: String, required: true, select: false },
    deviceId: { type: String, default: null, maxlength: 128 },
    deviceName: { type: String, required: true, maxlength: 100 },
    platform: { type: String, enum: [...clientPlatforms], required: true },
    appVersion: { type: String, default: null, maxlength: 32 },
    appBuild: { type: Number, default: null, min: 0 },
    userAgent: { type: String, required: true, maxlength: 512 },
    ipAddress: { type: String, required: true, maxlength: 128 },
    createdAt: { type: Date, default: Date.now, required: true },
    lastUsedAt: { type: Date, default: Date.now, required: true },
    lastRefreshAt: { type: Date, default: Date.now, required: true },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
    revokeReason: {
      type: String,
      enum: [
        "logout",
        "logout_all",
        "refresh_token_reuse",
        "account_status_change",
        "admin_password_change",
      ],
      default: null,
    },
  },
  { collection: "auth_sessions", versionKey: false },
);
authSessionSchema.index({ userId: 1 });

export const AuthSessionModel =
  (mongoose.models.AuthSession as Model<AuthSessionEntity> | undefined) ??
  model<AuthSessionEntity>("AuthSession", authSessionSchema);
