import { createAuthRouter as createCoreAuthRouter } from "@terqivo/auth-core";
import type { Router } from "express";

import { env } from "../../config/env.js";

/**
 * Monolith compatibility adapter. The auth implementation is owned by
 * @terqivo/auth-core and is mounted here only for direct/local monolith use.
 */
export function createAuthRouter(): Router {
  return createCoreAuthRouter({
    nodeEnv: env.NODE_ENV,
    registerRateLimitMax: env.AUTH_REGISTER_RATE_LIMIT_MAX,
    loginRateLimitMax: env.AUTH_LOGIN_RATE_LIMIT_MAX,
    refreshRateLimitMax: env.AUTH_REFRESH_RATE_LIMIT_MAX,
  });
}
