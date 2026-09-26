import cors from "cors";
import express, { type ErrorRequestHandler, type Express } from "express";
import helmet from "helmet";
import { ZodError } from "zod";

import { allowedWebOrigins } from "./config/env.js";
import { RealtimeError } from "./core/errors.js";
import { createHealthHandlers } from "./health/health.js";
import { logger } from "./logging/logger.js";
import type { RedisRuntime } from "./redis/client.js";

export function createRealtimeApp(redis: RedisRuntime): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ credentials: true, origin: (origin, callback) => callback(null, origin === undefined || allowedWebOrigins.includes(origin)) }));
  app.use(express.json({ limit: "1mb" }));
  const health = createHealthHandlers(redis);
  app.get("/health", health.health);
  app.get("/ready", health.ready);
  app.use((_request, response) => response.status(404).json({ success: false, error: { code: "ROUTE_NOT_FOUND", message: "Route not found." } }));
  app.use(createErrorHandler());
  return app;
}

function createErrorHandler(): ErrorRequestHandler {
  return (error: unknown, _request, response, next) => {
    if (response.headersSent) { next(error); return; }
    if (error instanceof RealtimeError) {
      response.status(error.statusCode).json({ success: false, error: { code: error.code, message: error.message } });
      return;
    }
    if (error instanceof ZodError) {
      response.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Request validation failed.", details: error.issues } });
      return;
    }
    logger.error({ err: error }, "Realtime Hub request failed");
    response.status(500).json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." } });
  };
}
