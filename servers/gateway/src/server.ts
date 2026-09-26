import "dotenv/config";

import { createServer, type Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";

import { createGatewayApp } from "./app.js";
import { createGatewayConfig, type GatewayConfig } from "./config.js";
import { createRequestContext } from "./logging/logger.js";
import {
  createGatewayProxy,
  proxySocketUpgrade,
  type GatewayRequest,
  setGatewayRequestHeaders,
} from "./proxy/gateway-proxy.js";
import { isSocketIoPath } from "./proxy/route-map.js";

export interface GatewayServer {
  readonly server: HttpServer;
  readonly config: GatewayConfig;
  readonly close: () => Promise<void>;
  readonly setReady: (ready: boolean) => void;
}

export function createGatewayServer(
  config = createGatewayConfig(),
): GatewayServer {
  let acceptingTraffic = true;
  const proxyRuntime = createGatewayProxy(config);
  const app = createGatewayApp(config, {
    proxy: proxyRuntime.proxy,
    logger: proxyRuntime.logger,
    isReady: () => acceptingTraffic,
  });
  const server = createServer(app);
  const upgradedSockets = new Set<Duplex>();

  server.on("upgrade", (request, socket, head) => {
    const path = safePath(request.url);
    if (!isSocketIoPath(path)) {
      socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      return;
    }
    upgradedSockets.add(socket);
    socket.once("close", () => upgradedSockets.delete(socket));
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
    setGatewayRequestHeaders(
      gatewayRequest,
      createRequestContext(contextInput),
      config,
    );
    proxySocketUpgrade(
      proxyRuntime.proxy,
      gatewayRequest,
      socket,
      head,
      config,
    );
  });

  return {
    server,
    config,
    setReady: (ready) => {
      acceptingTraffic = ready;
    },
    close: async () => {
      acceptingTraffic = false;
      proxyRuntime.close();
      for (const socket of upgradedSockets) {
        socket.destroy();
      }
      upgradedSockets.clear();
      if (!server.listening) return;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function start(): Promise<void> {
  const gateway = createGatewayServer();
  const shutdown = async (signal: string) => {
    gateway.setReady(false);
    const timeout = setTimeout(() => {
      gateway.server.closeAllConnections();
      process.exitCode = 1;
    }, gateway.config.shutdownTimeoutMs);
    try {
      await gateway.close();
      clearTimeout(timeout);
      gateway.server.removeAllListeners();
      if (gateway.config.nodeEnv !== "test") {
        console.info(`Gateway stopped after ${signal}`);
      }
    } catch (error) {
      clearTimeout(timeout);
      console.error("Gateway shutdown failed", error instanceof Error ? error.message : "unknown error");
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await new Promise<void>((resolve, reject) => {
    gateway.server.once("error", reject);
    gateway.server.listen(gateway.config.port, "0.0.0.0", () => {
      gateway.server.removeListener("error", reject);
      if (gateway.config.nodeEnv !== "test") {
        console.info(`Terqivo Gateway listening on ${gateway.config.port}`);
      }
      resolve();
    });
  });
}

function safePath(url: string | undefined): string {
  if (url === undefined) return "/";
  try {
    return new URL(url, "http://gateway.invalid").pathname;
  } catch {
    return "/invalid-request-path";
  }
}

if (process.env.NODE_ENV !== "test") {
  void start().catch((error: unknown) => {
    console.error("Gateway startup failed", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  });
}

export { start };
