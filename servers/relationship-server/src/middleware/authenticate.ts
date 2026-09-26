import type { Request, RequestHandler } from "express";

import type { AuthContext, AuthDirectoryClient } from "../clients/auth-directory.js";
import { AppError } from "../core/errors.js";

declare module "express-serve-static-core" { interface Request { auth?: AuthContext } }

export function createAuthenticate(client: AuthDirectoryClient): RequestHandler {
  return (request, _response, next) => {
    void (async () => {
      const header = request.get("authorization");
      const parts = header?.trim().split(/\s+/);
      if (parts?.length !== 2 || parts[0]?.toLowerCase() !== "bearer" || parts[1] === undefined) throw new AppError({ code: "AUTHENTICATION_REQUIRED", message: "Authentication is required.", statusCode: 401 });
      try { request.auth = await client.validateAccessToken(parts[1]); next(); }
      catch (error) { next(error instanceof AppError ? error : new AppError({ code: "AUTH_SERVICE_UNAVAILABLE", message: "The identity service is unavailable.", statusCode: 503 })); }
    })().catch(next);
  };
}

export function requireAuth(request: Request): AuthContext {
  if (request.auth === undefined) throw new AppError({ code: "AUTHENTICATION_REQUIRED", message: "Authentication is required.", statusCode: 401 });
  return request.auth;
}
