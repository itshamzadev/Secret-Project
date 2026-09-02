import compression from "compression";
import cookieParser from "cookie-parser";
import cors, { type CorsOptions } from "cors";
import express, { type Express, Router } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { allowedWebOrigins } from "./config/env.js";
import { AppError } from "./core/errors.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { createHealthRouter } from "./modules/health/health.routes.js";
import { getHealthSnapshot } from "./modules/health/health.service.js";
import type { HealthSnapshotProvider } from "./modules/health/health.types.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { createContactRouter } from "./modules/contacts/contact.routes.js";
import { createConversationRouter } from "./modules/conversations/conversation.routes.js";
import { createMessageRouter } from "./modules/messages/message.routes.js";
import { createUserRouter } from "./modules/users/user.routes.js";
import { createCallRouter } from "./modules/calls/call.routes.js";
import { createNotificationRouter } from "./modules/notifications/notification.routes.js";

export interface CreateAppOptions {
  getHealthSnapshot?: HealthSnapshotProvider;
}

function createCorsOptions(): CorsOptions {
  return {
    credentials: true,
    origin: (requestOrigin, callback) => {
      if (
        requestOrigin === undefined ||
        allowedWebOrigins.includes(requestOrigin)
      ) {
        callback(null, true);
        return;
      }

      callback(
        new AppError({
          code: "CORS_ORIGIN_DENIED",
          message: "The request origin is not allowed.",
          statusCode: 403,
        }),
      );
    },
  };
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const getSnapshot = options.getHealthSnapshot ?? getHealthSnapshot;

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors(createCorsOptions()));
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please try again later.",
        },
      },
    }),
  );
  app.use(pinoHttp({ logger }));

  const apiV1Router = Router();
  apiV1Router.use("/health", createHealthRouter(getSnapshot));
  apiV1Router.use("/auth", createAuthRouter());
  apiV1Router.use("/contacts", createContactRouter());
  apiV1Router.use("/conversations", createConversationRouter());
  apiV1Router.use("/conversations", createMessageRouter());
  apiV1Router.use("/users", createUserRouter());
  apiV1Router.use("/calls", createCallRouter());
  apiV1Router.use("/notifications", createNotificationRouter());
  app.use("/api/v1", apiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
