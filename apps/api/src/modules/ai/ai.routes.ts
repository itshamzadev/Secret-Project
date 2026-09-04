import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import { env } from "../../config/env.js";
import { authenticate } from "../../middleware/authenticate.js";
import { aiQueryController } from "./ai.controller.js";

const aiRateLimiter = rateLimit({
  windowMs: 60 * 1_000,
  limit: env.AI_RATE_LIMIT_MAX,
  keyGenerator: (request) =>
    request.auth?.userId ?? ipKeyGenerator(request.ip ?? "unknown"),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "AI_RATE_LIMITED",
      message: "Too many AI requests. Try again soon.",
    },
  },
});

export function createAiRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.post("/query", aiRateLimiter, aiQueryController);
  return router;
}
