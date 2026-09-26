import compression from "compression";
import cookieParser from "cookie-parser";
import cors, { type CorsOptions } from "cors";
import express, {
  type Express,
  type Request,
  type RequestHandler,
  Router,
} from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import {
  correlationIdHeader,
  createRequestContext,
  requestIdHeader,
  type RequestContext,
  type RequestContextInput,
} from "@terqivo/logger";

import { allowedWebOrigins, env } from "./config/env.js";
import { AppError } from "./core/errors.js";
import { mountAdminUi } from "./core/admin-ui.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { createHealthRouter } from "./modules/health/health.routes.js";
import { getHealthSnapshot } from "./modules/health/health.service.js";
import type { HealthSnapshotProvider } from "./modules/health/health.types.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { createContactRouter } from "./modules/contacts/contact.routes.js";
import { createConversationRouter } from "./modules/conversations/conversation.routes.js";
import {
  createMessageActionRouter,
  createMessageRouter,
} from "./modules/messages/message.routes.js";
import { createUserRouter } from "./modules/users/user.routes.js";
import { createCallRouter } from "./modules/calls/call.routes.js";
import { createNotificationRouter } from "./modules/notifications/notification.routes.js";
import {
  createMediaFileRouter,
  createMediaRouter,
} from "./modules/media/media.routes.js";
import { createSearchRouter } from "./modules/search/search.routes.js";
import { createAiRouter } from "./modules/ai/ai.routes.js";
import { createAdminRouter } from "./modules/admin/admin.routes.js";
import { createE2EFERouter } from "./modules/e2efe/e2efe.routes.js";
import { createGroupRouter } from "./modules/groups/group.routes.js";
import { createChannelRouter } from "./modules/channels/channel.routes.js";
import { createStatusRouter } from "./modules/status/status.routes.js";
import {
  createAdminReportRouter,
  createReportRouter,
} from "./modules/reports/report.routes.js";
import { createRealtimeCallBridgeRouter } from "./modules/calls/realtime-call-bridge.routes.js";

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

function isSameOriginRequest(request: Request, requestOrigin: string): boolean {
  return `${request.protocol}://${request.get("host")}` === requestOrigin;
}

type RequestWithContext = Request & {
  terqivoRequestContext?: RequestContext;
};

function requestContextMiddleware(
  request: Request,
  response: Parameters<RequestHandler>[1],
  next: Parameters<RequestHandler>[2],
): void {
  const contextInput: RequestContextInput = {};
  const requestId = request.get(requestIdHeader);
  const correlationId = request.get(correlationIdHeader);

  if (requestId !== undefined) {
    contextInput.requestId = requestId;
  }
  if (correlationId !== undefined) {
    contextInput.correlationId = correlationId;
  }

  const context = createRequestContext(contextInput);

  (request as RequestWithContext).terqivoRequestContext = context;
  response.setHeader(requestIdHeader, context.requestId);
  response.setHeader(correlationIdHeader, context.correlationId);
  next();
}

const apiCorsMiddleware: RequestHandler = (request, response, next) => {
  const requestOrigin = request.get("origin");

  // Same-origin admin/API requests do not need CORS headers. Skipping the
  // cross-origin check here also prevents the public admin host from being
  // mistaken for an unapproved external web origin.
  if (
    requestOrigin === undefined ||
    isSameOriginRequest(request, requestOrigin)
  ) {
    next();
    return;
  }

  cors(createCorsOptions())(request, response, next);
};

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  // Coolify/Traefik terminates one trusted proxy hop before this process.
  // Limiting trust to one hop keeps req.ip safe for rate-limit keys.
  app.set("trust proxy", 1);
  const getSnapshot = options.getHealthSnapshot ?? getHealthSnapshot;

  app.use(requestContextMiddleware);
  app.disable("x-powered-by");
  const publicUrlIsHttps =
    env.PUBLIC_URL !== undefined &&
    new URL(env.PUBLIC_URL).protocol === "https:";

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Helmet enables this by default in production. The current
          // deployment is HTTP, so upgrading admin assets would make the
          // browser request an untrusted HTTPS origin. Opt in only after the
          // configured public origin is HTTPS.
          "upgrade-insecure-requests": publicUrlIsHttps ? [] : null,
        },
      },
    }),
  );
  // CORS is an API concern. Static Admin UI assets must be served directly
  // and must not receive a JSON CORS rejection based on their Origin header.
  app.use("/api", apiCorsMiddleware);
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
  app.use(
    pinoHttp({
      logger,
      customProps: (request) => {
        const context = (request as RequestWithContext)
          .terqivoRequestContext;

        return context === undefined
          ? {}
          : {
              requestId: context.requestId,
              correlationId: context.correlationId,
            };
      },
    }),
  );

  const apiV1Router = Router();
  apiV1Router.use("/health", createHealthRouter(getSnapshot));
  apiV1Router.use("/auth", createAuthRouter());
  apiV1Router.use("/contacts", createContactRouter());
  apiV1Router.use("/conversations", createConversationRouter());
  apiV1Router.use("/conversations", createMessageRouter());
  apiV1Router.use("/messages", createMessageActionRouter());
  apiV1Router.use("/users", createUserRouter());
  apiV1Router.use("/calls", createCallRouter());
  apiV1Router.use("/notifications", createNotificationRouter());
  apiV1Router.use("/conversations", createMediaRouter());
  apiV1Router.use("/media", createMediaFileRouter());
  apiV1Router.use("/search", createSearchRouter());
  apiV1Router.use("/ai", createAiRouter());
  apiV1Router.use("/admin", createAdminRouter());
  apiV1Router.use("/admin/reports", createAdminReportRouter());
  apiV1Router.use("/reports", createReportRouter());
  apiV1Router.use("/e2efe", createE2EFERouter());
  apiV1Router.use("/groups", createGroupRouter());
  apiV1Router.use("/channels", createChannelRouter());
  apiV1Router.use("/status", createStatusRouter());
  app.use("/api/v1", apiV1Router);
  app.use("/internal/realtime", createRealtimeCallBridgeRouter());
  logger.info(
    { routePrefix: "/api/v1", loginRoute: "POST /api/v1/auth/login" },
    "API v1 routes mounted",
  );

  mountAdminUi(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
