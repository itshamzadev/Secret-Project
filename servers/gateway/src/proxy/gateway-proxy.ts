import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import type { Duplex } from "node:stream";

import httpProxy from "http-proxy";
import {
  childLogger,
  createServiceLogger,
  type Logger,
  type RequestContext,
} from "../logging/logger.js";

import type { GatewayConfig } from "../config.js";
import { routeTarget, type GatewayRoute } from "./route-map.js";

export type HttpProxyServer = InstanceType<typeof httpProxy>;

export interface GatewayRequest extends IncomingMessage {
  gatewayContext?: RequestContext;
  gatewayRoute?: GatewayRoute;
  gatewayTimedOut?: boolean;
}

export interface ProxyFailure {
  readonly statusCode: 502 | 504;
  readonly code: "GATEWAY_UPSTREAM_UNAVAILABLE" | "GATEWAY_UPSTREAM_TIMEOUT";
  readonly message: string;
}

export function createGatewayProxy(config: GatewayConfig): {
  proxy: HttpProxyServer;
  logger: Logger;
  close: () => void;
} {
  const logger = createServiceLogger({
    serviceName: config.serviceName,
    level: config.logLevel,
  });
  const proxy = httpProxy.createProxyServer({
    changeOrigin: false,
    ignorePath: false,
    preserveHeaderKeyCase: true,
    ws: true,
    xfwd: false,
    proxyTimeout: config.upstreamRequestTimeoutMs,
  });

  proxy.on("proxyReq", (proxyRequest, request) => {
    proxyRequest.once("timeout", () => {
      (request as GatewayRequest).gatewayTimedOut = true;
    });
    applyForwardedHeaders(request as GatewayRequest, proxyRequest);
  });

  proxy.on("proxyReqWs", (proxyRequest, request) => {
    applyForwardedHeaders(request as GatewayRequest, proxyRequest);
  });

  proxy.on("proxyRes", (proxyResponse, request, response) => {
    const gatewayRequest = request as GatewayRequest;
    const context = gatewayRequest.gatewayContext;
    if (context !== undefined && !response.headersSent) {
      response.setHeader("X-Request-ID", context.requestId);
      response.setHeader("X-Correlation-ID", context.correlationId);
    }
  });

  proxy.on("error", (error, request, response) => {
    const gatewayRequest = request as GatewayRequest;
    const context = gatewayRequest.gatewayContext;
    const requestLogger = context
      ? childLogger(logger, {
          requestId: context.requestId,
          correlationId: context.correlationId,
        })
      : logger;
    const errorCode = (error as NodeJS.ErrnoException).code;
    const timedOut =
      gatewayRequest.gatewayTimedOut === true ||
      errorCode === "ETIMEDOUT" ||
      errorCode === "ESOCKETTIMEDOUT";
    requestLogger.error(
      {
        err: error,
        method: gatewayRequest.method,
        path: safePath(gatewayRequest.url),
        upstreamService: gatewayRequest.gatewayRoute?.logicalService ?? "unknown",
      },
      "Gateway upstream proxy failed",
    );

    if (isSocket(response)) {
      response.destroy();
      return;
    }

    sendProxyFailure(response, {
      statusCode: timedOut ? 504 : 502,
      code: timedOut
        ? "GATEWAY_UPSTREAM_TIMEOUT"
        : "GATEWAY_UPSTREAM_UNAVAILABLE",
      message: timedOut
        ? "The upstream service did not respond in time."
        : "The upstream service is temporarily unavailable.",
    });
  });

  return {
    proxy,
    logger,
    close: () => proxy.close(),
  };
}

export function proxyHttpRequest(
  proxy: HttpProxyServer,
  request: GatewayRequest,
  response: ServerResponse,
  route: GatewayRoute,
  config: GatewayConfig,
): void {
  request.gatewayRoute = route;
  proxy.web(request, response, {
    target: routeTarget(route, config),
    changeOrigin: false,
    ignorePath: false,
    ws: false,
    xfwd: false,
    proxyTimeout: config.upstreamRequestTimeoutMs,
  });
}

export function proxySocketUpgrade(
  proxy: HttpProxyServer,
  request: GatewayRequest,
  socket: Duplex,
  head: Buffer,
  config: GatewayConfig,
): void {
  proxy.ws(request, socket, head, {
    target: config.realtimeHubUrl,
    changeOrigin: false,
    ignorePath: false,
    ws: true,
    xfwd: false,
  });
}

export function setGatewayRequestHeaders(
  request: GatewayRequest,
  context: RequestContext,
  config: GatewayConfig,
): void {
  request.gatewayContext = context;
  request.headers["x-request-id"] = context.requestId;
  request.headers["x-correlation-id"] = context.correlationId;

  const remoteAddress = request.socket.remoteAddress ?? "";
  const existingForwardedFor = request.headers["x-forwarded-for"];
  const forwardedFor =
    config.trustedProxyHops > 0 && typeof existingForwardedFor === "string"
      ? `${existingForwardedFor}, ${remoteAddress}`
      : remoteAddress;

  request.headers["x-forwarded-for"] = forwardedFor;
  const incomingForwardedHost = request.headers["x-forwarded-host"];
  request.headers["x-forwarded-host"] =
    config.trustedProxyHops > 0 && typeof incomingForwardedHost === "string"
      ? firstForwardedValue(incomingForwardedHost)
      : request.headers.host ?? "";
  const incomingForwardedProto = request.headers["x-forwarded-proto"];
  request.headers["x-forwarded-proto"] =
    config.trustedProxyHops > 0 && typeof incomingForwardedProto === "string"
      ? firstForwardedValue(incomingForwardedProto)
      : isTls(request)
        ? "https"
        : "http";
}

function applyForwardedHeaders(
  request: GatewayRequest,
  proxyRequest: { setHeader: (name: string, value: string) => void },
): void {
  const context = request.gatewayContext;
  if (context !== undefined) {
    proxyRequest.setHeader("X-Request-ID", context.requestId);
    proxyRequest.setHeader("X-Correlation-ID", context.correlationId);
  }
  proxyRequest.setHeader(
    "X-Forwarded-For",
    request.headers["x-forwarded-for"]?.toString() ?? request.socket.remoteAddress ?? "",
  );
  proxyRequest.setHeader(
    "X-Forwarded-Host",
    request.headers["x-forwarded-host"]?.toString() ?? request.headers.host ?? "",
  );
  proxyRequest.setHeader(
    "X-Forwarded-Proto",
    request.headers["x-forwarded-proto"]?.toString() ?? "http",
  );
}

export function sendProxyFailure(
  response: ServerResponse,
  failure: ProxyFailure,
): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }

  response.writeHead(failure.statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(
    JSON.stringify({
      success: false,
      error: { code: failure.code, message: failure.message },
    }),
  );
}

function safePath(url: string | undefined): string {
  if (url === undefined) return "/";
  try {
    return new URL(url, "http://gateway.invalid").pathname;
  } catch {
    return "/invalid-request-path";
  }
}

function isSocket(value: ServerResponse | Socket): value is Socket {
  return "destroy" in value && !("setHeader" in value);
}

function isTls(request: IncomingMessage): boolean {
  return (request.socket as IncomingMessage["socket"] & { encrypted?: boolean })
    .encrypted === true;
}

function firstForwardedValue(value: string): string {
  return value.split(",", 1)[0]?.trim() ?? "";
}
