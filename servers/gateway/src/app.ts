import { type IncomingMessage, type ServerResponse } from "node:http";

import {
  createRequestContext,
  childLogger,
  type Logger,
} from "./logging/logger.js";

import type { GatewayConfig } from "./config.js";
import {
  proxyHttpRequest,
  setGatewayRequestHeaders,
  type GatewayRequest,
} from "./proxy/index.js";
import { isSocketIoPath, routeForPath, socketIoRoute } from "./proxy/route-map.js";
import type { HttpProxyServer } from "./proxy/index.js";

export interface GatewayDependencies {
  readonly proxy: HttpProxyServer;
  readonly logger: Logger;
  readonly isReady?: () => boolean;
}

export function createGatewayApp(
  config: GatewayConfig,
  dependencies: GatewayDependencies,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    const gatewayRequest = request as GatewayRequest;
    const contextInput: {
      requestId?: string | string[];
      correlationId?: string | string[];
    } = {};
    const incomingRequestId = request.headers["x-request-id"];
    const incomingCorrelationId = request.headers["x-correlation-id"];
    if (incomingRequestId !== undefined) contextInput.requestId = incomingRequestId;
    if (incomingCorrelationId !== undefined) {
      contextInput.correlationId = incomingCorrelationId;
    }
    const context = createRequestContext(contextInput);
    const requestLogger = childLogger(dependencies.logger, {
      requestId: context.requestId,
      correlationId: context.correlationId,
    });
    const startedAt = performance.now();
    setGatewayRequestHeaders(gatewayRequest, context, config);
    response.setHeader("X-Request-ID", context.requestId);
    response.setHeader("X-Correlation-ID", context.correlationId);

    response.once("finish", () => {
      requestLogger.info(
        {
          method: request.method,
          path: safePath(request.url),
          statusCode: response.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
          upstreamService: gatewayRequest.gatewayRoute?.logicalService ?? "gateway",
        },
        "Gateway request completed",
      );
    });

    const path = safePath(request.url);
    if (path === "/health") {
      handleHealth(request, response, config);
      return;
    }
    if (path === "/ready") {
      void handleReady(request, response, config, dependencies.isReady);
      return;
    }
    if (path === "/api/v1/health" || path === "/api/v1/health/live" || path === "/api/v1/health/ready") {
      handleApiHealth(request, response, config, dependencies.isReady, path.endsWith("/ready"));
      return;
    }

    const route = routeForPath(path);
    if (route === undefined && !isSocketIoPath(path)) {
      sendJson(response, 404, {
        success: false,
        error: { code: "GATEWAY_ROUTE_NOT_FOUND", message: "Route not found." },
      });
      return;
    }

    if (route !== undefined) {
      proxyHttpRequest(dependencies.proxy, gatewayRequest, response, route, config);
      return;
    }

    gatewayRequest.gatewayRoute = socketIoRoute;
    // Socket.IO polling requests are intentionally proxied as opaque HTTP.
    proxyHttpRequest(
      dependencies.proxy,
      gatewayRequest,
      response,
      gatewayRequest.gatewayRoute,
      config,
    );
  };
}

async function handleReady(
  request: IncomingMessage,
  response: ServerResponse,
  config: GatewayConfig,
  isReady: (() => boolean) | undefined,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, {
      success: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." },
    });
    return;
  }

  if (isReady !== undefined && !isReady()) {
    sendJson(response, 503, {
      success: false,
      error: { code: "GATEWAY_NOT_READY", message: "Gateway is shutting down." },
    });
    return;
  }

  sendJson(response, 200, {
    success: true,
    data: { status: "ready", serviceName: config.serviceName, version: config.version },
  });
}

function handleApiHealth(
  request: IncomingMessage,
  response: ServerResponse,
  config: GatewayConfig,
  isReady: (() => boolean) | undefined,
  readiness: boolean,
): void {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
    return;
  }
  const ready = isReady?.() ?? true;
  if (readiness && !ready) {
    sendJson(response, 503, { success: false, error: { code: "GATEWAY_NOT_READY", message: "Gateway is not ready." } });
    return;
  }
  sendJson(response, 200, {
    success: true,
    data: { status: readiness ? "ready" : "ok", serviceName: config.serviceName, version: config.version, uptime: process.uptime() },
  });
}

function handleHealth(
  request: IncomingMessage,
  response: ServerResponse,
  config: GatewayConfig,
): void {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, {
      success: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." },
    });
    return;
  }
  sendJson(response, 200, {
    success: true,
    data: {
      status: "ok",
      serviceName: config.serviceName,
      version: config.version,
    },
  });
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  if (response.headersSent) return;
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function safePath(url: string | undefined): string {
  if (url === undefined) return "/";
  try {
    return new URL(url, "http://gateway.invalid").pathname;
  } catch {
    return "/invalid-request-path";
  }
}
