import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from "express";
import helmet from "helmet";
import { ZodError } from "zod";

import { AppError } from "./internal/auth-core/contracts.js";
import { createRequestContext, correlationIdHeader, createServiceLogger, requestIdHeader, childLogger, type Logger } from "./logging/logger.js";
import { configureAuthCore, createAuthRouter, createIdentityRouter } from "./internal/auth-core/index.js";
import { createInternalRouter } from "./internal/routes.js";

import type { AuthServerConfig } from "./config.js";
import { getRedisStatus, publishSessionRevoked } from "./redis.js";

export interface AuthAppDependencies {
  readonly logger?: Logger;
  readonly getDatabaseStatus?: () => "connected" | "disconnected";
  readonly getRedisStatus?: () => "connected" | "disconnected";
}

export function createAuthApp(config: AuthServerConfig, dependencies: AuthAppDependencies = {}): Express {
  configureAuthCore({
    jwtAccessSecret: config.JWT_ACCESS_SECRET,
    jwtRefreshSecret: config.JWT_REFRESH_SECRET,
    jwtIssuer: config.JWT_ISSUER,
    jwtAudience: config.JWT_AUDIENCE,
    accessTokenTtlSeconds: config.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
    onSessionRevoked: publishSessionRevoked,
  });

  const logger = dependencies.logger ?? createServiceLogger({ serviceName: config.SERVICE_NAME, level: config.LOG_LEVEL });
  const getDatabaseStatus = dependencies.getDatabaseStatus ?? (() => "disconnected");
  const getRedis = dependencies.getRedisStatus ?? getRedisStatus;
  const app = express();
  app.disable("x-powered-by");
  app.use(requestContextMiddleware(logger));
  app.use(helmet());
  app.use("/api", cors({
    credentials: true,
    origin: (requestOrigin, callback) => {
      if (requestOrigin === undefined || config.WEB_ORIGIN.split(",").map((origin) => origin.trim()).includes(requestOrigin)) {
        callback(null, true);
        return;
      }
      callback(new AppError({ code: "CORS_ORIGIN_DENIED", message: "The request origin is not allowed.", statusCode: 403 }));
    },
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (_request, response) => {
    response.status(200).json({ success: true, data: { status: "ok", serviceName: config.SERVICE_NAME, version: config.SERVICE_VERSION } });
  });
  app.get("/ready", (_request, response) => {
    const database = getDatabaseStatus();
    const redis = getRedis();
    const ready = database === "connected" && redis === "connected";
    response.status(ready ? 200 : 503).json({ success: ready, data: ready ? { status: "ready", serviceName: config.SERVICE_NAME, version: config.SERVICE_VERSION, dependencies: { database, redis } } : undefined, error: ready ? undefined : { code: "AUTH_SERVICE_NOT_READY", message: "Auth service is not ready." } });
  });
  app.use("/api/v1/auth", createAuthRouter({ nodeEnv: config.NODE_ENV, registerRateLimitMax: config.AUTH_REGISTER_RATE_LIMIT_MAX, loginRateLimitMax: config.AUTH_LOGIN_RATE_LIMIT_MAX, refreshRateLimitMax: config.AUTH_REFRESH_RATE_LIMIT_MAX }));
  app.use("/api/v1/users", createIdentityRouter(config));
  app.use("/internal", createInternalRouter(config));
  app.use((_request, response) => { response.status(404).json({ success: false, error: { code: "ROUTE_NOT_FOUND", message: "Route not found." } }); });
  app.use(createErrorHandler(logger, config.NODE_ENV));
  return app;
}

function requestContextMiddleware(logger: Logger): RequestHandler {
  return (request, response, next) => {
    const input: { requestId?: string; correlationId?: string } = {};
    const incomingRequestId = request.get(requestIdHeader);
    const incomingCorrelationId = request.get(correlationIdHeader);
    if (incomingRequestId !== undefined) input.requestId = incomingRequestId;
    if (incomingCorrelationId !== undefined) input.correlationId = incomingCorrelationId;
    const context = createRequestContext(input);
    response.setHeader(requestIdHeader, context.requestId);
    response.setHeader(correlationIdHeader, context.correlationId);
    const requestLogger = childLogger(logger, { requestId: context.requestId, correlationId: context.correlationId });
    const startedAt = performance.now();
    response.once("finish", () => { requestLogger.info({ method: request.method, path: request.path, statusCode: response.statusCode, durationMs: Math.round(performance.now() - startedAt) }, "Auth request completed"); });
    next();
  };
}

function createErrorHandler(logger: Logger, nodeEnv: AuthServerConfig["NODE_ENV"]): ErrorRequestHandler {
  return (error: unknown, _request, response, next) => {
    if (response.headersSent) { next(error); return; }
    let statusCode = 500;
    let code = "INTERNAL_SERVER_ERROR";
    let message = "An unexpected error occurred.";
    let details: unknown;
    if (error instanceof AppError) { statusCode = error.statusCode; code = error.code; message = error.message; details = error.details; }
    else if (error instanceof ZodError) { statusCode = 400; code = "VALIDATION_ERROR"; message = "Request validation failed."; details = error.issues; }
    else if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large") { statusCode = 413; code = "REQUEST_TOO_LARGE"; message = "Request body is too large."; }
    if (statusCode >= 500) logger.error({ err: error, statusCode }, message); else logger.warn({ err: error, statusCode }, message);
    response.status(statusCode).json({ success: false, error: { code, message: nodeEnv === "production" && statusCode >= 500 ? "An unexpected error occurred." : message, ...(details === undefined ? {} : { details }) } });
  };
}
