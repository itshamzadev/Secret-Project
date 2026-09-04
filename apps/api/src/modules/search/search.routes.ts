import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import { env } from "../../config/env.js";
import { authenticate } from "../../middleware/authenticate.js";
import { webSearchController } from "./search.controller.js";

const webSearchRateLimiter = rateLimit({
  windowMs: 60 * 1_000,
  limit: env.SEARCH_RATE_LIMIT_MAX,
  keyGenerator: (request) =>
    request.auth?.userId ?? ipKeyGenerator(request.ip ?? "unknown"),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "WEB_SEARCH_RATE_LIMITED",
      message: "Too many searches. Try again soon.",
    },
  },
});

export function createSearchRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.get("/web", webSearchRateLimiter, webSearchController);
  return router;
}
