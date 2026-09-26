import type { NextFunction, Request, RequestHandler, Response } from "express";

import type { AuthClient, AuthContext } from "../clients/auth.client.js";
import { AppError } from "../core/errors.js";

declare module "express-serve-static-core" { interface Request { statusAuth?: AuthContext } }

export function createAuthenticate(auth: AuthClient): RequestHandler {
  return (request, _response, next) => {
    void (async () => {
      const header = request.get("authorization");
      const token = header?.trim().split(/\s+/);
      if (token === undefined || token.length !== 2 || token[0]?.toLowerCase() !== "bearer" || token[1] === undefined || token[1] === "") throw new AppError({ code: "AUTHENTICATION_REQUIRED", message: "Authentication is required.", statusCode: 401 });
      request.statusAuth = await auth.validateAccessToken(token[1]);
      next();
    })().catch((error: unknown) => next(error instanceof AppError ? error : new AppError({ code: "INVALID_ACCESS_TOKEN", message: "The access token is invalid or expired.", statusCode: 401 })));
  };
}

export function requireAuthContext(request: Request): AuthContext {
  if (request.statusAuth === undefined) throw new AppError({ code: "AUTHENTICATION_REQUIRED", message: "Authentication is required.", statusCode: 401 });
  return request.statusAuth;
}

export function controller(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next: NextFunction) => { void handler(request, response).catch(next); };
}
