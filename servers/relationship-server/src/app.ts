import { randomUUID } from "node:crypto";

import cors from "cors";
import express, { type ErrorRequestHandler, type Express } from "express";
import helmet from "helmet";
import { ZodError } from "zod";

import { AuthDirectoryClient } from "./clients/auth-directory.js";
import { env } from "./config/env.js";
import { AppError } from "./core/errors.js";
import { logger } from "./lib/logger.js";
import { RelationshipService } from "./modules/relationships/relationship.service.js";
import { createInternalRelationshipRouter, createRelationshipRouter } from "./routes/relationship.routes.js";

export interface RelationshipAppDependencies {
  readonly authClient?: AuthDirectoryClient;
  readonly service?: RelationshipService;
  readonly databaseStatus?: () => "connected" | "disconnected";
}

export function createRelationshipApp(dependencies: RelationshipAppDependencies = {}): Express {
  const auth = dependencies.authClient ?? new AuthDirectoryClient();
  const service = dependencies.service ?? new RelationshipService(auth);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use("/api", cors({ credentials: true, origin: (origin, callback) => callback(null, origin === undefined || env.WEB_ORIGIN.split(",").map((value) => value.trim()).includes(origin)) }));
  app.use((request, response, next) => {
    const requestId = validHeader(request.get("x-request-id")) ?? randomUUID();
    const correlationId = validHeader(request.get("x-correlation-id")) ?? requestId;
    response.setHeader("X-Request-ID", requestId);
    response.setHeader("X-Correlation-ID", correlationId);
    const started = performance.now();
    response.once("finish", () => logger.info({ requestId, correlationId, method: request.method, path: request.path, statusCode: response.statusCode, durationMs: Math.round(performance.now() - started) }, "Relationship request completed"));
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (_request, response) => response.json({ success: true, data: { status: "ok", serviceName: env.SERVICE_NAME, version: env.SERVICE_VERSION } }));
  app.get("/ready", (_request, response) => { const database = dependencies.databaseStatus?.() ?? "disconnected"; const ready = database === "connected"; response.status(ready ? 200 : 503).json(ready ? { success: true, data: { status: "ready", serviceName: env.SERVICE_NAME, version: env.SERVICE_VERSION, dependencies: { database } } } : { success: false, error: { code: "RELATIONSHIP_SERVER_NOT_READY", message: "Relationship service is not ready." } }); });
  app.use("/api/v1", createRelationshipRouter(service, auth));
  app.use("/internal/relationships", createInternalRelationshipRouter(service));
  app.use((_request, response) => response.status(404).json({ success: false, error: { code: "ROUTE_NOT_FOUND", message: "Route not found." } }));
  app.use(((error, _request, response, next) => {
    if (response.headersSent) { next(error); return; }
    if (error instanceof ZodError) { response.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Request validation failed.", details: error.issues } }); return; }
    if (error instanceof AppError) { response.status(error.statusCode).json({ success: false, error: { code: error.code, message: error.statusCode >= 500 ? "An unexpected error occurred." : error.message, ...(error.details === undefined ? {} : { details: error.details }) } }); return; }
    logger.error({ err: error }, "Relationship request failed");
    response.status(500).json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." } });
  }) as ErrorRequestHandler);
  return app;
}

function validHeader(value: string | undefined): string | undefined { return value !== undefined && value.length >= 20 && value.length <= 200 && /^[A-Za-z0-9._:-]+$/.test(value) ? value : undefined; }
