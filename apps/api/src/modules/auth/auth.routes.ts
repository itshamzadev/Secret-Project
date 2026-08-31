import { Router } from "express";
import rateLimit from "express-rate-limit";

import { env } from "../../config/env.js";
import { authenticate } from "../../middleware/authenticate.js";
import {
  listSessionsController,
  loginController,
  logoutAllController,
  logoutController,
  meController,
  refreshController,
  registerController,
  revokeSessionController,
} from "./auth.controller.js";

function createAuthLimiter(limit: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: "AUTH_RATE_LIMIT_EXCEEDED",
        message: "Too many authentication attempts. Please try again later.",
      },
    },
  });
}

export function createAuthRouter(): Router {
  const router = Router();

  router.post(
    "/register",
    createAuthLimiter(env.AUTH_REGISTER_RATE_LIMIT_MAX),
    registerController,
  );
  router.post(
    "/login",
    createAuthLimiter(env.AUTH_LOGIN_RATE_LIMIT_MAX),
    loginController,
  );
  router.post(
    "/refresh",
    createAuthLimiter(env.AUTH_REFRESH_RATE_LIMIT_MAX),
    refreshController,
  );
  router.post("/logout", authenticate, logoutController);
  router.post("/logout-all", authenticate, logoutAllController);
  router.get("/me", authenticate, meController);
  router.get("/sessions", authenticate, listSessionsController);
  router.delete("/sessions/:sessionId", authenticate, revokeSessionController);

  return router;
}
