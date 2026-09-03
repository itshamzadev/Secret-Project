import { Router } from "express";
import rateLimit from "express-rate-limit";

import { env } from "../../config/env.js";
import {
  authenticateAdmin,
  requireAdminPermission,
} from "../../middleware/authenticate-admin.js";
import {
  adminDashboardController,
  adminLoginController,
  adminLogoutController,
  adminMeController,
  adminUsersController,
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
  return router;
}
