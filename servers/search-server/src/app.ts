import express, { type Express, type RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { AppError } from "./core/errors.js";
import { logger } from "./logging/logger.js";
import type { AuthClient } from "./clients/auth.client.js";
import { AuthServerClient } from "./clients/auth.client.js";
import { SearchService } from "./modules/search/search.service.js";
import { createSearchRouter } from "./modules/search/search.routes.js";
import { AiOrchestrator } from "./modules/ai/ai.service.js";
import { createAiRouter } from "./modules/ai/ai.routes.js";

export interface SearchAppOptions { authClient?: AuthClient; searchService?: SearchService; aiOrchestrator?: AiOrchestrator; readinessCheck?: () => Promise<boolean>; }
export function createApp(options: SearchAppOptions = {}): Express {
  const app = express();
  app.disable("x-powered-by"); app.use(helmet()); app.use(cors({ origin: env.WEB_ORIGIN, credentials: true })); app.use(express.json({ limit: "64kb" }));
  app.use(requestContext);
  app.get("/health", (_request, response) => response.status(200).json({ success: true, data: { serviceName: env.SERVICE_NAME, version: env.SERVICE_VERSION, status: "ok" } }));
  app.get("/ready", async (_request, response) => { const ready = await (options.readinessCheck ?? checkAuthReadiness)(); response.status(ready ? 200 : 503).json(ready ? { success: true, data: { serviceName: env.SERVICE_NAME, version: env.SERVICE_VERSION, status: "ready", dependencies: { auth: "reachable", redis: "optional", aiProvider: env.GEMINI_API_KEY === undefined ? "not-configured" : "configured" } } } : { success: false, error: { code: "SEARCH_SERVICE_NOT_READY", message: "A required internal dependency is unavailable." } }); });
  const auth = options.authClient ?? new AuthServerClient();
  app.use("/api/v1/search", createSearchRouter(auth, options.searchService ?? new SearchService()));
  app.use("/api/v1/ai", createAiRouter(auth, options.aiOrchestrator ?? new AiOrchestrator()));
  app.use((_request, response) => response.status(404).json({ success: false, error: { code: "ROUTE_NOT_FOUND", message: "Route not found." } }));
  app.use(errorHandler);
  return app;
}

const requestContext: RequestHandler = (request, response, next) => { const requestId = safeId(request.get("x-request-id")) ?? randomUUID(); const correlationId = safeId(request.get("x-correlation-id")) ?? requestId; request.requestId = requestId; request.correlationId = correlationId; response.setHeader("x-request-id", requestId); response.setHeader("x-correlation-id", correlationId); const started = Date.now(); response.on("finish", () => logger.info({ service: env.SERVICE_NAME, method: request.method, path: request.path, status: response.statusCode, durationMs: Date.now() - started, requestId, correlationId }, "HTTP request completed")); next(); };
function errorHandler(error: unknown, request: express.Request, response: express.Response, next: express.NextFunction): void { void next; const appError = error instanceof AppError ? error : error instanceof ZodError ? new AppError({ code: "VALIDATION_ERROR", message: "The request is invalid.", statusCode: 400 }) : new AppError({ code: "INTERNAL_ERROR", message: "An unexpected error occurred.", statusCode: 500 }); if (!(error instanceof AppError) && !(error instanceof ZodError)) logger.error({ err: error, requestId: request.requestId, correlationId: request.correlationId }, "Unhandled search-server error"); if (!response.headersSent) response.status(appError.statusCode).json({ success: false, error: { code: appError.code, message: appError.message } }); }
function safeId(value: string | undefined): string | undefined { return value !== undefined && /^[A-Za-z0-9._:-]{8,128}$/.test(value) ? value : undefined; }
async function checkAuthReadiness(): Promise<boolean> { try { const response = await fetch(`${env.AUTH_SERVICE_URL}/health`, { signal: AbortSignal.timeout(2_000) }); return response.ok; } catch { return false; } }
