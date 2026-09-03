import type { Request, RequestHandler } from "express";

import type { AdminPermission } from "@terqivo/contracts";

import { AppError } from "../core/errors.js";
import { getAdminAuthContext } from "../modules/admin/admin.service.js";
import { verifyAdminAccessToken } from "../modules/admin/admin.tokens.js";
import type { AdminAuthContext } from "../modules/admin/admin-user.types.js";

function adminAuthenticationRequired(): AppError {
  return new AppError({
    code: "ADMIN_AUTHENTICATION_REQUIRED",
    message: "Administrative authentication is required.",
    statusCode: 401,
  });
}

function invalidAdminAccessToken(): AppError {
  return new AppError({
    code: "INVALID_ADMIN_ACCESS_TOKEN",
    message: "The administrative access token is invalid or expired.",
    statusCode: 401,
  });
}

function extractAdminBearerToken(value: string | undefined): string {
  if (value === undefined) throw adminAuthenticationRequired();
  const parts = value.trim().split(/\s+/);
  if (
    parts.length !== 2 ||
    parts[0]?.toLowerCase() !== "bearer" ||
    parts[1] === undefined ||
    parts[1].length === 0
  ) {
    throw invalidAdminAccessToken();
  }
  return parts[1];
}

export const authenticateAdmin: RequestHandler = (request, _response, next) => {
  void (async () => {
    try {
      const claims = await verifyAdminAccessToken(
        extractAdminBearerToken(request.get("authorization")),
      );
      request.admin = await getAdminAuthContext(claims.sub);
      next();
    } catch (error: unknown) {
      next(
        error instanceof AppError &&
          (error.code === "ADMIN_AUTH_NOT_CONFIGURED" ||
            error.code === "ADMIN_NOT_FOUND")
          ? error
          : invalidAdminAccessToken(),
      );
    }
  })();
};

export function requireAdminContext(request: Request): AdminAuthContext {
  if (request.admin === undefined) throw adminAuthenticationRequired();
  return request.admin;
}

export function requireAdminPermission(
  permission: AdminPermission,
): RequestHandler {
  return (request, _response, next) => {
    const context = requireAdminContext(request);
    if (
      context.role === "super_admin" ||
      context.permissions.includes(permission)
    ) {
      next();
      return;
    }
    next(
      new AppError({
        code: "ADMIN_PERMISSION_REQUIRED",
        message: "You do not have permission to perform this action.",
        statusCode: 403,
      }),
    );
  };
}
