import { Router } from "express";
import rateLimit from "express-rate-limit";

import { env } from "../../config/env.js";
import {
  authenticateAdmin,
  requireAdminPermission,
} from "../../middleware/authenticate-admin.js";
import {
  adminDashboardController,
  adminChangeUserPasswordController,
  adminDeleteUserController,
  adminLoginController,
  adminLogoutController,
  adminMeController,
  adminUserStatusController,
  adminUsersController,
  adminGroupsController,
  adminChannelsController,
  adminUserTierController,
  adminUserBadgesController,
  adminGroupBadgesController,
  adminChannelBadgesController,
} from "./admin.controller.js";

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.ADMIN_LOGIN_RATE_LIMIT_MAX,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "ADMIN_RATE_LIMIT_EXCEEDED",
      message: "Too many administrative login attempts. Try again later.",
    },
  },
});

export function createAdminRouter(): Router {
  const router = Router();
  router.post("/auth/login", adminLoginLimiter, adminLoginController);
  router.post("/auth/logout", authenticateAdmin, adminLogoutController);
  router.get("/auth/me", authenticateAdmin, adminMeController);
  router.get(
    "/dashboard",
    authenticateAdmin,
    requireAdminPermission("dashboard.view"),
    adminDashboardController,
  );
  router.get(
    "/users",
    authenticateAdmin,
    requireAdminPermission("users.view"),
    adminUsersController,
  );
  router.get(
    "/groups",
    authenticateAdmin,
    requireAdminPermission("users.view"),
    adminGroupsController,
  );
  router.get(
    "/channels",
    authenticateAdmin,
    requireAdminPermission("users.view"),
    adminChannelsController,
  );
  router.patch(
    "/users/:userId/password",
    authenticateAdmin,
    requireAdminPermission("users.manage"),
    adminChangeUserPasswordController,
  );
  router.patch(
    "/users/:userId/status",
    authenticateAdmin,
    requireAdminPermission("users.suspend"),
    adminUserStatusController,
  );
  router.patch(
    "/users/:userId/tier",
    authenticateAdmin,
    requireAdminPermission("users.manage"),
    adminUserTierController,
  );
  router.patch(
    "/users/:userId/badges",
    authenticateAdmin,
    requireAdminPermission("users.manage"),
    adminUserBadgesController,
  );
  router.patch(
    "/groups/:groupId/badges",
    authenticateAdmin,
    requireAdminPermission("users.manage"),
    adminGroupBadgesController,
  );
  router.patch(
    "/channels/:channelId/badges",
    authenticateAdmin,
    requireAdminPermission("users.manage"),
    adminChannelBadgesController,
  );
  router.delete(
    "/users/:userId",
    authenticateAdmin,
    requireAdminPermission("users.manage"),
    adminDeleteUserController,
  );
  return router;
}
