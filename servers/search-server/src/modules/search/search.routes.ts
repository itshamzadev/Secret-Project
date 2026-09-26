import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../../config/env.js";
import type { AuthClient } from "../../clients/auth.client.js";
import { createAuthenticate, requireAuth } from "../../middleware/auth.js";
import { webSearchQuerySchema } from "./search.validation.js";
import type { SearchService } from "./search.service.js";

export function createSearchRouter(auth: AuthClient, service: SearchService): Router {
  const router = Router();
  router.use(createAuthenticate(auth));
  const limiter = rateLimit({ windowMs: 60_000, limit: env.SEARCH_RATE_LIMIT_MAX, keyGenerator: (request) => request.auth?.userId ?? ipKeyGenerator(request.ip ?? "unknown"), standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, error: { code: "WEB_SEARCH_RATE_LIMITED", message: "Too many searches. Try again soon." } } });
  router.get("/web", limiter, async (request, response, next) => { try { requireAuth(request); const result = await service.searchWeb(webSearchQuerySchema.parse(request.query)); response.status(200).json({ success: true, data: result }); } catch (error) { next(error); } });
  return router;
}
