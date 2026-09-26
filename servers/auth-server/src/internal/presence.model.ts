import mongoose, { model, Schema, type HydratedDocument, type Model, type Types } from "mongoose";
import { clientPlatforms, type ClientPlatform } from "./auth-core/contracts.js";

export interface PresenceSessionEntity { userId: Types.ObjectId; startedAt: Date; endedAt: Date | null; durationSeconds: number; deviceId: string | null; platform: ClientPlatform | null; createdAt: Date; updatedAt: Date; }
export type PresenceSessionDocument = HydratedDocument<PresenceSessionEntity>;
const schema = new Schema<PresenceSessionEntity>({ userId: { type: Schema.Types.ObjectId, required: true }, startedAt: { type: Date, required: true }, endedAt: { type: Date, default: null }, durationSeconds: { type: Number, required: true, default: 0 }, deviceId: { type: String, default: null }, platform: { type: String, enum: [...clientPlatforms, null], default: null } }, { collection: "user_presence_sessions", timestamps: true, versionKey: false });
schema.index({ userId: 1, startedAt: -1 });
schema.index({ userId: 1 }, { unique: true, partialFilterExpression: { endedAt: null } });
export const PresenceSessionModel = (mongoose.models.AuthPresenceSession as Model<PresenceSessionEntity> | undefined) ?? model<PresenceSessionEntity>("AuthPresenceSession", schema);
