import crypto from "node:crypto";
import cors from "cors";
import express, { type ErrorRequestHandler, type Express } from "express";
import helmet from "helmet";
import { ZodError } from "zod";

import { env, allowedWebOrigins } from "./config/env.js";
import { AppError } from "./core/errors.js";
import { logger } from "./lib/logger.js";
import { createHealthRouter } from "./health/health.js";
import { createCallRouter } from "./modules/calls/call.routes.js";
import { createCallBridgeRouter } from "./internal/call-bridge.routes.js";
import { createCallAdminRouter } from "./internal/admin.routes.js";

export function createCallApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ credentials: true, origin: (origin, callback) => callback(null, origin === undefined || allowedWebOrigins.includes(origin)) }));
  app.use((request, response, next) => {
    const requestId = safeId(request.get("x-request-id"));
    const correlationId = safeId(request.get("x-correlation-id")) ?? requestId;
    response.setHeader("X-Request-ID", requestId ?? safeId(undefined));
    response.setHeader("X-Correlation-ID", correlationId ?? response.getHeader("X-Request-ID") as string);
    const started = performance.now();
    response.once("finish", () => logger.info({ requestId, correlationId, method: request.method, path: request.path, statusCode: response.statusCode, durationMs: Math.round(performance.now() - started) }, "Call request completed"));
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.use(createHealthRouter());
  app.use("/internal/realtime", createCallBridgeRouter());
  app.use("/internal/admin", createCallAdminRouter());
  app.use("/api/v1/calls", createCallRouter());
  app.use((_request, response) => response.status(404).json({ success: false, error: { code: "ROUTE_NOT_FOUND", message: "Route not found." } }));
  app.use(errorHandler());
  return app;
}

function safeId(value: string | undefined): string {
  return value !== undefined && /^[A-Za-z0-9-]{20,128}$/.test(value) ? value : crypto.randomUUID();
}

function errorHandler(): ErrorRequestHandler {
  return (error: unknown, _request, response, next) => {
    if (response.headersSent) { next(error); return; }
    let statusCode = 500; let code = "INTERNAL_SERVER_ERROR"; let message = "An unexpected error occurred."; let details: unknown;
    if (error instanceof AppError) { statusCode = error.statusCode; code = error.code; message = error.message; details = error.details; }
    else if (error instanceof ZodError) { statusCode = 400; code = "VALIDATION_ERROR"; message = "Request validation failed."; details = error.issues; }
    else logger.error({ err: error }, "Call request failed");
    response.status(statusCode).json({ success: false, error: { code, message: env.NODE_ENV === "production" && statusCode >= 500 ? "An unexpected error occurred." : message, ...(details === undefined ? {} : { details }) } });
  };
}
