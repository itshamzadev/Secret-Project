/* eslint-disable @typescript-eslint/no-namespace */
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { AppError } from "../core/errors.js";
import { verifyAccessToken } from "../auth/jwt.js";
import type { AuthContext } from "../auth/types.js";

declare global {
  namespace Express {
    interface Request { mediaAuth?: AuthContext; }
  }
}

export const authenticate: RequestHandler = (request, _response, next) => {
  const header = request.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token === "") { next(new AppError({ code: "AUTHENTICATION_REQUIRED", message: "Authentication is required.", statusCode: 401 })); return; }
  void verifyAccessToken(token).then((context) => { request.mediaAuth = context; next(); }).catch(() => next(new AppError({ code: "INVALID_ACCESS_TOKEN", message: "The access token is invalid or expired.", statusCode: 401 })));
};

export function requireAuthContext(request: Request): AuthContext {
  if (request.mediaAuth === undefined) throw new AppError({ code: "AUTHENTICATION_REQUIRED", message: "Authentication is required.", statusCode: 401 });
  return request.mediaAuth;
}

export function bearerToken(request: Request): string {
  const header = request.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token === "") throw new AppError({ code: "AUTHENTICATION_REQUIRED", message: "Authentication is required.", statusCode: 401 });
  return token;
}

export function controller(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next: NextFunction) => { void handler(request, response).catch(next); };
}
