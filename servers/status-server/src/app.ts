import { randomUUID } from "node:crypto";

import cors from "cors";
import express, { type ErrorRequestHandler, type Express } from "express";
import helmet from "helmet";
import { ZodError } from "zod";

import { HttpAuthClient, type AuthClient } from "./clients/auth.client.js";
import { HttpMediaClient, type MediaClient } from "./clients/media.client.js";
import { HttpRelationshipClient, type RelationshipClient } from "./clients/relationship.client.js";
import type { StatusServerConfig } from "./config.js";
import { AppError } from "./core/errors.js";
import { createLogger } from "./logging/logger.js";
import { createStatusRouter } from "./modules/status/status.routes.js";
import { StatusService } from "./modules/status/status.service.js";

export interface StatusAppDependencies {
  readonly auth?: AuthClient;
  readonly relationships?: RelationshipClient;
  readonly media?: MediaClient;
  readonly databaseStatus?: () => "connected" | "disconnected";
}

export function createStatusApp(config: StatusServerConfig, dependencies: StatusAppDependencies = {}): Express {
  const logger = createLogger(config);
  const auth = dependencies.auth ?? new HttpAuthClient(config);
  const relationships = dependencies.relationships ?? new HttpRelationshipClient(config);
  const media = dependencies.media ?? new HttpMediaClient(config);
  const service = new StatusService({ auth, relationships, media });
  const databaseStatus = dependencies.databaseStatus ?? (() => "disconnected");
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use("/api", cors({ credentials: true, origin: (origin, callback) => callback(null, origin === undefined || config.WEB_ORIGIN.split(",").map((value) => value.trim()).includes(origin)) }));
  app.use((request, response, next) => {
    const requestId = validHeader(request.get("x-request-id")) ?? randomUUID();
    const correlationId = validHeader(request.get("x-correlation-id")) ?? requestId;
    response.setHeader("X-Request-ID", requestId);
    response.setHeader("X-Correlation-ID", correlationId);
    const started = performance.now();
    response.once("finish", () => logger.info({ requestId, correlationId, method: request.method, path: request.path, statusCode: response.statusCode, durationMs: Math.round(performance.now() - started) }, "Status request completed"));
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (_request, response) => response.status(200).json({ success: true, data: { status: "ok", serviceName: config.SERVICE_NAME, version: config.SERVICE_VERSION } }));
  app.get("/ready", (_request, response) => {
    const database = databaseStatus();
    const ready = database === "connected";
    response.status(ready ? 200 : 503).json(ready ? { success: true, data: { status: "ready", serviceName: config.SERVICE_NAME, version: config.SERVICE_VERSION, dependencies: { database } } } : { success: false, error: { code: "STATUS_SERVICE_NOT_READY", message: "Status service is not ready." } });
  });
  app.use("/api/v1/status", createStatusRouter(service, auth, config.STATUS_MAX_MEDIA_SIZE_BYTES));
  app.use((_request, response) => response.status(404).json({ success: false, error: { code: "ROUTE_NOT_FOUND", message: "Route not found." } }));
  app.use(createErrorHandler(logger, config.NODE_ENV));
  return app;
}

function createErrorHandler(logger: ReturnType<typeof createLogger>, nodeEnv: StatusServerConfig["NODE_ENV"]): ErrorRequestHandler {
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
    response.status(statusCode).json({ success: false, error: { code, message: nodeEnv === "production" && statusCode >= 500 ? "An unexpected error occurred." : message, ...(details === undefined ? {} : { details }) } });
  };
}

function validHeader(value: string | undefined): string | undefined { return value !== undefined && value.length >= 20 && value.length <= 200 && /^[A-Za-z0-9._:-]+$/.test(value) ? value : undefined; }
