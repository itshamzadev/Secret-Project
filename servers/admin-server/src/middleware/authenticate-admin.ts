import type { RequestHandler } from "express";

import type { AdminPermission } from "../modules/admin/contracts.js";
import { AppError } from "../core/errors.js";
import type { AdminServerConfig } from "../config/env.js";
import { AdminUserModel } from "../models/admin-user.js";
import { verifyAdminAccessToken } from "../auth/admin-jwt.js";

export function createAdminAuthentication(config: AdminServerConfig): RequestHandler {
  return (request, _response, next) => {
    void (async () => {
      const header = request.get("authorization");
      const parts = header?.trim().split(/\s+/) ?? [];
      if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer" || parts[1] === undefined) throw new AppError({ code: "ADMIN_AUTHENTICATION_REQUIRED", message: "Administrative authentication is required.", statusCode: 401 });
      const claims = await verifyAdminAccessToken(config, parts[1]);
      const admin = await AdminUserModel.findById(claims.sub).exec();
      if (admin === null || admin.accountStatus !== "active") throw new AppError({ code: "INVALID_ADMIN_ACCESS_TOKEN", message: "The administrative access token is invalid or expired.", statusCode: 401 });
      request.admin = { adminId: admin._id.toString(), role: admin.role, permissions: admin.permissions };
      next();
    })().catch(next);
  };
}

export function requireAdminPermission(permission: AdminPermission): RequestHandler {
  return (request, _response, next) => {
    const context = request.admin;
    if (context === undefined) { next(new AppError({ code: "ADMIN_AUTHENTICATION_REQUIRED", message: "Administrative authentication is required.", statusCode: 401 })); return; }
    if (context.role === "super_admin" || context.permissions.includes(permission)) { next(); return; }
    next(new AppError({ code: "ADMIN_PERMISSION_REQUIRED", message: "You do not have permission to perform this action.", statusCode: 403 }));
  };
}

export function requireAdminContext(request: Parameters<RequestHandler>[0]) {
  if (request.admin === undefined) throw new AppError({ code: "ADMIN_AUTHENTICATION_REQUIRED", message: "Administrative authentication is required.", statusCode: 401 });
  return request.admin;
}
