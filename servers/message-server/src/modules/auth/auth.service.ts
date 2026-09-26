import { Types } from "mongoose";
import { AuthSessionModel } from "./auth-session.model.js";

export async function getActiveSession(userId: string, sessionId: string) {
  if (!Types.ObjectId.isValid(userId)) return null;
  return AuthSessionModel.findOne({ userId: new Types.ObjectId(userId), sessionId, revokedAt: null, expiresAt: { $gt: new Date() } }).exec();
}
