import type { RequestHandler } from "express";

import { AppError } from "../core/errors.js";
import type { AuthClient } from "../clients/auth.client.js";

function bearer(value: string | undefined): string {
  if (value === undefined) throw new AppError({ code: "AUTHENTICATION_REQUIRED", message: "Authentication is required.", statusCode: 401 });
  const parts = value.trim().split(/\s+/u);
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer" || parts[1] === undefined || parts[1].length === 0) throw new AppError({ code: "INVALID_ACCESS_TOKEN", message: "The access token is invalid or expired.", statusCode: 401 });
  return parts[1];
}

export function createAuthenticate(auth: AuthClient): RequestHandler {
  return (request, _response, next) => { void auth.validateAccessToken(bearer(request.get("authorization"))).then((context) => { request.auth = context; next(); }).catch(next); };
}

export function requireAuth(request: { auth?: { userId: string; sessionId: string } }): { userId: string; sessionId: string } {
  if (request.auth === undefined) throw new AppError({ code: "AUTHENTICATION_REQUIRED", message: "Authentication is required.", statusCode: 401 });
  return request.auth;
}
