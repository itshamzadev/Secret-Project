import cors from "cors";
import express, { type ErrorRequestHandler, type Express } from "express";
import helmet from "helmet";
import { ZodError } from "zod";

import { env } from "./config/env.js";
import { AppError } from "./core/errors.js";
import { logger } from "./logging/logger.js";
import { createHealthRouter } from "./health/health.js";
import { createInternalFileRouter } from "./internal/file.routes.js";
import { createMediaRouter } from "./modules/media/media.routes.js";

export interface MediaAppDependencies {
  readonly storageReady?: () => boolean;
}

export function createMediaApp(dependencies: MediaAppDependencies = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use("/api", cors({ credentials: true, origin: (origin, callback) => callback(null, origin === undefined || env.WEB_ORIGIN.split(",").map((value) => value.trim()).includes(origin)) }));
  app.use((request, response, next) => {
    const requestId = request.get("x-request-id") ?? cryptoSafeId();
    const correlationId = request.get("x-correlation-id") ?? requestId;
    response.setHeader("X-Request-ID", requestId);
    response.setHeader("X-Correlation-ID", correlationId);
    const started = performance.now();
    response.once("finish", () => logger.info({ requestId, correlationId, method: request.method, path: request.path, statusCode: response.statusCode, durationMs: Math.round(performance.now() - started) }, "Media request completed"));
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.use(createHealthRouter(dependencies.storageReady ?? (() => true)));
  app.use("/internal/media", createInternalFileRouter());
  app.use("/api/v1", createMediaRouter());
  app.use((_request, response) => response.status(404).json({ success: false, error: { code: "ROUTE_NOT_FOUND", message: "Route not found." } }));
  app.use(createErrorHandler());
  return app;
}

function createErrorHandler(): ErrorRequestHandler {
  return (error: unknown, _request, response, next) => {
    if (response.headersSent) { next(error); return; }
    let statusCode = 500;
    let code = "INTERNAL_SERVER_ERROR";
    let message = "An unexpected error occurred.";
    let details: unknown;
    if (error instanceof AppError) { statusCode = error.statusCode; code = error.code; message = error.message; details = error.details; }
    else if (error instanceof ZodError) { statusCode = 400; code = "VALIDATION_ERROR"; message = "Request validation failed."; details = error.issues; }
    else if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") { statusCode = 413; code = "REQUEST_TOO_LARGE"; message = "Request body is too large."; }
    if (statusCode >= 500) logger.error({ err: error, statusCode }, message); else logger.warn({ statusCode, code }, message);
    response.status(statusCode).json({ success: false, error: { code, message: env.NODE_ENV === "production" && statusCode >= 500 ? "An unexpected error occurred." : message, ...(details === undefined ? {} : { details }) } });
  };
}

function cryptoSafeId(): string { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; }
