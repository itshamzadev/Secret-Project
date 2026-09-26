import { jwtVerify, type JWTPayload } from "jose";

import { env } from "../config/env.js";
import { Types } from "mongoose";
import { AuthSessionModel } from "../models/auth-session.model.js";
import { UserModel } from "../models/user.model.js";

export interface AccessClaims extends JWTPayload {
  sub: string;
  sid: string;
}

export async function verifyAccessToken(value: string): Promise<AccessClaims> {
  const result = await jwtVerify<AccessClaims>(value, new TextEncoder().encode(env.JWT_ACCESS_SECRET), {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    algorithms: ["HS256"],
  });
  if (typeof result.payload.sub !== "string" || typeof result.payload.sid !== "string") {
    throw new Error("Access token claims are incomplete");
  }
  return result.payload;
}

export async function authenticateCurrentUser(value: string): Promise<string> {
  const claims = await verifyAccessToken(value);
  if (!Types.ObjectId.isValid(claims.sub)) throw new Error("Invalid access token");
  const [user, session] = await Promise.all([
    UserModel.findById(claims.sub).select({ accountStatus: 1 }).lean().exec(),
    AuthSessionModel.findOne({ userId: new Types.ObjectId(claims.sub), sessionId: claims.sid, revokedAt: null, expiresAt: { $gt: new Date() } }).select({ _id: 1 }).lean().exec(),
  ]);
  if (user === null || session === null) throw new Error("Invalid access token");
  if (user.accountStatus !== "active") throw new Error(user.accountStatus === "suspended" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_DISABLED");
  return claims.sub;
}
