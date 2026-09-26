import cors from "cors";
import express, { type ErrorRequestHandler, type Express } from "express";
import helmet from "helmet";
import { ZodError } from "zod";

import type { AdminServerConfig } from "./config/env.js";
import { allowedWebOrigins } from "./config/env.js";
import { AppError } from "./core/errors.js";
import { logger } from "./logging/logger.js";
import { requestContextMiddleware } from "./middleware/request-context.js";
import { createAdminRouter } from "./modules/admin/routes.js";
import { createAdminReportRouter, createReportRouter } from "./modules/reports/routes.js";

export interface AdminServerDependencies { databaseStatus: () => "connected" | "disconnected"; redisStatus: () => "connected" | "disconnected"; countOnlineUsers?: () => Promise<number>; }

export function createAdminApp(config: AdminServerConfig, dependencies: AdminServerDependencies = { databaseStatus: () => "disconnected", redisStatus: () => "disconnected" }): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(requestContextMiddleware);
  app.use(helmet());
  app.use("/api", cors({ credentials: true, origin: (origin, callback) => callback(null, origin === undefined || allowedWebOrigins.includes(origin)) }));
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (_request, response) => response.status(200).json({ success: true, data: { status: "ok", serviceName: config.SERVICE_NAME, version: config.SERVICE_VERSION, uptime: process.uptime() } }));
  app.get("/ready", (_request, response) => { const database = dependencies.databaseStatus(); const redis = dependencies.redisStatus(); const ready = database === "connected"; response.status(ready ? 200 : 503).json(ready ? { success: true, data: { status: "ready", serviceName: config.SERVICE_NAME, version: config.SERVICE_VERSION, dependencies: { database, redis } } } : { success: false, error: { code: "ADMIN_SERVICE_NOT_READY", message: "Admin service is not ready." } }); });
  app.use("/api/v1/admin/reports", createAdminReportRouter(config));
  app.use("/api/v1/admin", createAdminRouter(config, dependencies));
  app.use("/api/v1/reports", createReportRouter(config));
  app.use((_request, response) => response.status(404).json({ success: false, error: { code: "ROUTE_NOT_FOUND", message: "Route not found." } }));
  app.use(createErrorHandler(config));
  return app;
}

function createErrorHandler(config: AdminServerConfig): ErrorRequestHandler { return (error: unknown, _request, response, next) => { if (response.headersSent) { next(error); return; } let statusCode = 500; let code = "INTERNAL_SERVER_ERROR"; let message = "An unexpected error occurred."; let details: unknown; if (error instanceof AppError) { statusCode = error.statusCode; code = error.code; message = error.message; details = error.details; } else if (error instanceof ZodError) { statusCode = 400; code = "VALIDATION_ERROR"; message = "Request validation failed."; details = error.issues; } if (statusCode >= 500) logger.error({ err: error, statusCode }, message); else logger.warn({ code, statusCode }, message); response.status(statusCode).json({ success: false, error: { code, message: config.NODE_ENV === "production" && statusCode >= 500 ? "An unexpected error occurred." : message, ...(details === undefined ? {} : { details }) } }); }; }
