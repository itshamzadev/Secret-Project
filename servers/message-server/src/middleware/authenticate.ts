import type { Request, RequestHandler } from "express";
import { Types } from "mongoose";
import { AppError } from "../core/errors.js";
import { getActiveSession } from "../modules/auth/auth.service.js";
import { verifyAccessToken } from "../modules/auth/auth.tokens.js";
import { getUserById } from "../modules/users/user.service.js";

function error(code: string, message: string, statusCode: number): AppError { return new AppError({ code, message, statusCode }); }
function bearer(value: string | undefined): string {
  if (value === undefined) throw error("AUTHENTICATION_REQUIRED", "Authentication is required.", 401);
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer" || !parts[1]) throw error("INVALID_ACCESS_TOKEN", "The access token is invalid or expired.", 401);
  return parts[1];
}

export const authenticate: RequestHandler = (request, _response, next) => {
  void (async () => {
    try {
      const claims = await verifyAccessToken(bearer(request.get("authorization")));
      if (!Types.ObjectId.isValid(claims.sub)) throw new Error("invalid subject");
      const [user, session] = await Promise.all([getUserById(claims.sub), getActiveSession(claims.sub, claims.sid)]);
      if (user === null || session === null) throw new Error("inactive session");
      if (user.accountStatus !== "active") throw error(user.accountStatus === "suspended" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_DISABLED", user.accountStatus === "suspended" ? "This account is suspended." : "This account is disabled.", 403);
      request.auth = { userId: claims.sub, sessionId: claims.sid };
      next();
    } catch (caught) { next(caught instanceof AppError ? caught : error("INVALID_ACCESS_TOKEN", "The access token is invalid or expired.", 401)); }
  })();
};

export function requireAuthContext(request: Request): { userId: string; sessionId: string } {
  if (request.auth === undefined) throw error("AUTHENTICATION_REQUIRED", "Authentication is required.", 401);
  return request.auth;
}
