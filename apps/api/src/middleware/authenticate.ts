import type { Request, RequestHandler } from "express";
import { Types } from "mongoose";

import { AppError } from "../core/errors.js";
import { getActiveSession } from "../modules/auth/auth.service.js";
import { verifyAccessToken } from "../modules/auth/auth.tokens.js";
import { getUserById } from "../modules/users/user.service.js";

function authenticationRequired(): AppError {
  return new AppError({
    code: "AUTHENTICATION_REQUIRED",
    message: "Authentication is required.",
    statusCode: 401,
  });
}

function invalidAccessToken(): AppError {
  return new AppError({
    code: "INVALID_ACCESS_TOKEN",
    message: "The access token is invalid or expired.",
    statusCode: 401,
  });
}

function accountStatusError(accountStatus: "suspended" | "disabled"): AppError {
  return new AppError({
    code:
      accountStatus === "suspended" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_DISABLED",
    message:
      accountStatus === "suspended"
        ? "This account is suspended."
        : "This account is disabled.",
    statusCode: 403,
  });
}

function extractBearerToken(authorizationHeader: string | undefined): string {
  if (authorizationHeader === undefined) {
    throw authenticationRequired();
  }

  const parts = authorizationHeader.trim().split(/\s+/);
  if (
    parts.length !== 2 ||
    parts[0]?.toLowerCase() !== "bearer" ||
    parts[1] === undefined ||
    parts[1].length === 0
  ) {
    throw invalidAccessToken();
  }

  return parts[1];
}

export const authenticate: RequestHandler = (request, _response, next) => {
  void (async () => {
    try {
      const accessToken = extractBearerToken(request.get("authorization"));
      const claims = await verifyAccessToken(accessToken).catch(() => {
        throw invalidAccessToken();
      });

      if (!Types.ObjectId.isValid(claims.sub)) {
        throw invalidAccessToken();
      }

      const [user, session] = await Promise.all([
        getUserById(claims.sub),
        getActiveSession(claims.sub, claims.sid),
      ]);

      if (user === null || session === null) {
        throw invalidAccessToken();
      }

      if (user.accountStatus !== "active") {
        throw accountStatusError(user.accountStatus);
      }

      request.auth = {
        userId: claims.sub,
        sessionId: claims.sid,
      };
      next();
    } catch (error) {
      next(error instanceof AppError ? error : invalidAccessToken());
    }
  })();
};

export function requireAuthContext(request: Request) {
  if (request.auth === undefined) {
    throw authenticationRequired();
  }

  return request.auth;
}
