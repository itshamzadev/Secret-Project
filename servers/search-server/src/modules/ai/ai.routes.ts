import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../../config/env.js";
import type { AuthClient } from "../../clients/auth.client.js";
import { createAuthenticate, requireAuth } from "../../middleware/auth.js";
import { aiQuerySchema } from "./ai.validation.js";
import type { AiOrchestrator } from "./ai.service.js";

export function createAiRouter(auth: AuthClient, orchestrator: AiOrchestrator): Router {
  const router = Router(); router.use(createAuthenticate(auth));
  const limiter = rateLimit({ windowMs: 60_000, limit: env.AI_RATE_LIMIT_MAX, keyGenerator: (request) => request.auth?.userId ?? ipKeyGenerator(request.ip ?? "unknown"), standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, error: { code: "AI_RATE_LIMITED", message: "Too many AI requests. Try again soon." } } });
  router.get("/models", (_request, response) => response.status(200).json({ success: true, data: orchestrator.listModels() }));
  router.post("/query", limiter, async (request, response, next) => { try { const authContext = requireAuth(request); const result = await orchestrator.answer(aiQuerySchema.parse(request.body), { userId: authContext.userId }); response.status(200).json({ success: true, data: result }); } catch (error) { next(error); } });
  router.post("/query/stream", limiter, async (request, response, next) => { try { const authContext = requireAuth(request); const input = aiQuerySchema.parse(request.body); const controller = new AbortController(); const abort = (): void => { if (!response.writableEnded) controller.abort(); }; response.once("close", abort); response.status(200); response.setHeader("Cache-Control", "no-cache, no-transform"); response.setHeader("Content-Type", "text/event-stream; charset=utf-8"); response.setHeader("Connection", "keep-alive"); response.flushHeaders(); try { const result = await orchestrator.stream(input, { userId: authContext.userId }, { signal: controller.signal, onChunk: (text) => { response.write(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`); } }); response.write(`data: ${JSON.stringify({ type: "complete", data: result })}\n\n`); response.end(); } catch { if (!response.writableEnded) { response.write(`data: ${JSON.stringify({ type: "failed", message: "Terqivo AI could not complete that response." })}\n\n`); response.end(); } } finally { response.off("close", abort); } } catch (error) { next(error); } });
  return router;
}
