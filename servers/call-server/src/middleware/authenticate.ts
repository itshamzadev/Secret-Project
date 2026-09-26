import type { Request, RequestHandler } from "express";
import { Types } from "mongoose";

import { AppError } from "../core/errors.js";
import { verifyAccessToken } from "../auth/jwt.js";
import { AuthSessionModel } from "../models/auth-session.model.js";
import { UserModel } from "../models/user.model.js";

function authError(code: string, message: string, statusCode: number): AppError {
  return new AppError({ code, message, statusCode });
}

function bearer(value: string | undefined): string {
  if (value === undefined) throw authError("AUTHENTICATION_REQUIRED", "Authentication is required.", 401);
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer" || parts[1] === undefined) throw authError("INVALID_ACCESS_TOKEN", "The access token is invalid or expired.", 401);
  return parts[1];
}

export const authenticate: RequestHandler = (request, _response, next) => {
  void (async () => {
    try {
      const claims = await verifyAccessToken(bearer(request.get("authorization")));
      if (!Types.ObjectId.isValid(claims.sub)) throw new Error("invalid subject");
      const [user, session] = await Promise.all([
        UserModel.findById(claims.sub).exec(),
        AuthSessionModel.findOne({ userId: claims.sub, sessionId: claims.sid, revokedAt: null, expiresAt: { $gt: new Date() } }).exec(),
      ]);
      if (user === null || session === null) throw new Error("inactive session");
      if (user.accountStatus !== "active") throw authError(user.accountStatus === "suspended" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_DISABLED", user.accountStatus === "suspended" ? "This account is suspended." : "This account is disabled.", 403);
      request.auth = { userId: claims.sub, sessionId: claims.sid };
      next();
    } catch (error) {
      next(error instanceof AppError ? error : authError("INVALID_ACCESS_TOKEN", "The access token is invalid or expired.", 401));
    }
  })();
};

export function requireAuthContext(request: Request): { userId: string; sessionId: string } {
  const auth = (request as Request & { auth?: { userId: string; sessionId: string } }).auth;
  if (auth === undefined) throw authError("AUTHENTICATION_REQUIRED", "Authentication is required.", 401);
  return auth;
}
