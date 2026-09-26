import cors from "cors";
import express, { type ErrorRequestHandler, type Express } from "express";
import helmet from "helmet";
import { ZodError } from "zod";

import { env } from "./config/env.js";
import { AppError } from "./core/errors.js";
import { logger } from "./lib/logger.js";
import { createHealthRouter } from "./health/health.js";
import { createConversationRouter } from "./modules/conversations/conversation.routes.js";
import { createMessageActionRouter, createMessageRouter } from "./modules/messages/message.routes.js";
import { createGroupRouter } from "./modules/groups/group.routes.js";
import { createChannelRouter } from "./modules/channels/channel.routes.js";
import { createE2EFERouter } from "./modules/e2efe/e2efe.routes.js";
import { createMessageBridgeRouter } from "./internal/message-bridge.routes.js";
import { createAdminRouter } from "./internal/admin.routes.js";

export function createMessageApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use("/api", cors({ credentials: true, origin: (origin, callback) => callback(null, origin === undefined || env.WEB_ORIGIN.split(",").map((item) => item.trim()).includes(origin)) }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use((request, response, next) => {
    const requestId = request.get("x-request-id") ?? cryptoSafeId();
    const correlationId = request.get("x-correlation-id") ?? requestId;
    response.setHeader("X-Request-ID", requestId);
    response.setHeader("X-Correlation-ID", correlationId);
    const started = performance.now();
    response.once("finish", () => logger.info({ requestId, correlationId, method: request.method, path: request.path, statusCode: response.statusCode, durationMs: Math.round(performance.now() - started) }, "Message request completed"));
    next();
  });

  app.use(createHealthRouter());
  app.use("/internal/admin", createAdminRouter());
  app.use("/internal", createMessageBridgeRouter());
  const api = express.Router();
  api.use("/conversations", createConversationRouter());
  api.use("/conversations", createMessageRouter());
  api.use("/messages", createMessageActionRouter());
  api.use("/groups", createGroupRouter());
  api.use("/channels", createChannelRouter());
  api.use("/e2efe", createE2EFERouter());
  app.use("/api/v1", api);
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
    else logger.error({ err: error }, "Message request failed");
    response.status(statusCode).json({ success: false, error: { code, message: env.NODE_ENV === "production" && statusCode >= 500 ? "An unexpected error occurred." : message, ...(details === undefined ? {} : { details }) } });
  };
}

function cryptoSafeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
