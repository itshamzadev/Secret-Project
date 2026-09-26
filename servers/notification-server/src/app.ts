import { randomUUID } from "node:crypto";

import cors from "cors";
import express, { type ErrorRequestHandler, type Express } from "express";
import helmet from "helmet";
import { ZodError } from "zod";

import { env } from "./config/env.js";
import { authenticateCurrentUser } from "./auth/jwt.js";
import { AppError } from "./core/errors.js";
import { createHealthRouter } from "./health/health.js";
import { createInternalNotificationRouter } from "./internal/notification.routes.js";
import { logger } from "./logging/logger.js";
import { createNotificationRouter } from "./modules/notifications/notification.routes.js";
import type { NotificationService } from "./modules/notifications/notification.service.js";
import type { PushDeviceRepository } from "./modules/notifications/notification.types.js";

export interface NotificationAppDependencies {
  readonly service: NotificationService;
  readonly devices: PushDeviceRepository;
  readonly databaseStatus: () => "connected" | "disconnected";
  readonly redisStatus: () => "connected" | "disconnected";
  readonly authenticateUser?: (accessToken: string) => Promise<string>;
}

export function createNotificationApp(dependencies: NotificationAppDependencies): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use("/api", cors({ credentials: true, origin: (origin, callback) => callback(null, origin === undefined || env.WEB_ORIGIN.split(",").map((value) => value.trim()).includes(origin)) }));
  app.use((request, response, next) => {
    const requestId = validHeader(request.get("x-request-id")) ?? randomUUID();
    const correlationId = validHeader(request.get("x-correlation-id")) ?? requestId;
    response.setHeader("X-Request-ID", requestId);
    response.setHeader("X-Correlation-ID", correlationId);
    const started = performance.now();
    response.once("finish", () => logger.info({ requestId, correlationId, method: request.method, path: request.path, statusCode: response.statusCode, durationMs: Math.round(performance.now() - started) }, "Notification request completed"));
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.use(createHealthRouter({ serviceName: env.SERVICE_NAME, version: env.SERVICE_VERSION, database: dependencies.databaseStatus, redis: dependencies.redisStatus }));
  app.use("/internal", createInternalNotificationRouter(dependencies.service));
  app.use("/api/v1/notifications", createNotificationRouter(dependencies.devices, dependencies.service, dependencies.authenticateUser ?? authenticateCurrentUser));
  app.use((_request, response) => response.status(404).json({ success: false, error: { code: "ROUTE_NOT_FOUND", message: "Route not found." } }));
  app.use(createErrorHandler());
  return app;
}

function validHeader(value: string | undefined): string | undefined {
  if (value === undefined || value.length < 20 || value.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(value)) return undefined;
  return value;
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
