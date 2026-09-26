import { URL } from "node:url";

export type GatewayLogLevel =
  | "fatal"
  | "error"
  | "warn"
  | "info"
  | "debug"
  | "trace"
  | "silent";

const logLevels = new Set<GatewayLogLevel>([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
]);

const futureServiceEnvironmentNames = [
  "AUTH_SERVICE_URL",
  "MESSAGE_SERVICE_URL",
  "REALTIME_HUB_URL",
  "CALL_SERVICE_URL",
  "MEDIA_SERVICE_URL",
  "NOTIFICATION_SERVICE_URL",
  "RELATIONSHIP_SERVICE_URL",
  "STATUS_SERVICE_URL",
  "SEARCH_SERVICE_URL",
  "ADMIN_SERVICE_URL",
] as const;

export type FutureServiceEnvironmentName =
  (typeof futureServiceEnvironmentNames)[number];

export interface GatewayConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly serviceName: string;
  readonly version: string;
  readonly port: number;
  readonly authServiceUrl: string;
  readonly messageServiceUrl: string;
  readonly callServiceUrl: string;
  readonly mediaServiceUrl: string;
  readonly notificationServiceUrl: string;
  readonly relationshipServiceUrl: string;
  readonly statusServiceUrl: string;
  readonly searchServiceUrl: string;
  readonly adminServiceUrl: string;
  readonly realtimeHubUrl: string;
  readonly upstreamConnectTimeoutMs: number;
  readonly upstreamRequestTimeoutMs: number;
  readonly shutdownTimeoutMs: number;
  readonly trustedProxyHops: number;
  readonly logLevel: GatewayLogLevel;
  readonly futureServiceUrls: Readonly<
    Record<FutureServiceEnvironmentName, string | undefined>
  >;
}

export interface GatewayConfigOverrides {
  readonly nodeEnv?: GatewayConfig["nodeEnv"];
  readonly serviceName?: string;
  readonly version?: string;
  readonly port?: number;
  readonly authServiceUrl?: string;
  readonly messageServiceUrl?: string;
  readonly callServiceUrl?: string;
  readonly mediaServiceUrl?: string;
  readonly notificationServiceUrl?: string;
  readonly relationshipServiceUrl?: string;
  readonly statusServiceUrl?: string;
  readonly searchServiceUrl?: string;
  readonly adminServiceUrl?: string;
  readonly realtimeHubUrl?: string;
  readonly upstreamConnectTimeoutMs?: number;
  readonly upstreamRequestTimeoutMs?: number;
  readonly shutdownTimeoutMs?: number;
  readonly trustedProxyHops?: number;
  readonly logLevel?: GatewayLogLevel;
  readonly futureServiceUrls?: Partial<
    Record<FutureServiceEnvironmentName, string | undefined>
  >;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Gateway numeric configuration must be a positive integer");
  }
  return value;
}

function nonNegativeInteger(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Gateway proxy hop configuration must be a non-negative integer");
  }
  return value;
}

function validTarget(raw: string | undefined, name: string): string {
  const value = raw?.trim();
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }

  const target = new URL(value);
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }
  if (target.username !== "" || target.password !== "") {
    throw new Error(`${name} must not contain credentials`);
  }
  if (target.search !== "" || target.hash !== "") {
    throw new Error(`${name} must not contain a query string or fragment`);
  }

  return target.toString().replace(/\/$/, "");
}

function resolveLogLevel(raw: string | undefined): GatewayLogLevel {
  const value = raw?.trim() || "info";
  if (!logLevels.has(value as GatewayLogLevel)) {
    throw new Error("LOG_LEVEL is invalid");
  }
  return value as GatewayLogLevel;
}

function futureUrlsFromEnvironment(): Record<
  FutureServiceEnvironmentName,
  string | undefined
> {
  return Object.fromEntries(
    futureServiceEnvironmentNames.map((name) => {
      const value = process.env[name]?.trim();
      return [name, value === "" ? undefined : value];
    }),
  ) as Record<FutureServiceEnvironmentName, string | undefined>;
}

export function createGatewayConfig(
  overrides: GatewayConfigOverrides = {},
): GatewayConfig {
  const nodeEnv = overrides.nodeEnv ?? process.env.NODE_ENV ?? "development";
  if (nodeEnv !== "development" && nodeEnv !== "test" && nodeEnv !== "production") {
    throw new Error("NODE_ENV is invalid");
  }

  const futureServiceUrls = {
    ...futureUrlsFromEnvironment(),
    ...overrides.futureServiceUrls,
  };
  const authServiceUrl = overrides.authServiceUrl ?? process.env.AUTH_SERVICE_URL;
  const messageServiceUrl = overrides.messageServiceUrl ?? process.env.MESSAGE_SERVICE_URL;
  const realtimeHubUrl = overrides.realtimeHubUrl ?? process.env.REALTIME_HUB_URL;
  const callServiceUrl = overrides.callServiceUrl ?? process.env.CALL_SERVICE_URL;
  const mediaServiceUrl = overrides.mediaServiceUrl ?? process.env.MEDIA_SERVICE_URL;
  const notificationServiceUrl = overrides.notificationServiceUrl ?? process.env.NOTIFICATION_SERVICE_URL;
  const relationshipServiceUrl = overrides.relationshipServiceUrl ?? process.env.RELATIONSHIP_SERVICE_URL;
  const statusServiceUrl = overrides.statusServiceUrl ?? process.env.STATUS_SERVICE_URL;
  const searchServiceUrl = overrides.searchServiceUrl ?? process.env.SEARCH_SERVICE_URL;
  const adminServiceUrl = overrides.adminServiceUrl ?? process.env.ADMIN_SERVICE_URL;

  return {
    nodeEnv,
    serviceName: overrides.serviceName ?? "gateway",
    version: overrides.version ?? process.env.SERVICE_VERSION ?? "0.1.0",
    port: overrides.port ?? positiveInteger(process.env.PORT, 5000),
    authServiceUrl: validTarget(
      authServiceUrl,
      "AUTH_SERVICE_URL",
    ),
    messageServiceUrl: validTarget(messageServiceUrl, "MESSAGE_SERVICE_URL"),
    callServiceUrl: validTarget(callServiceUrl, "CALL_SERVICE_URL"),
    mediaServiceUrl: validTarget(mediaServiceUrl, "MEDIA_SERVICE_URL"),
    notificationServiceUrl: validTarget(notificationServiceUrl, "NOTIFICATION_SERVICE_URL"),
    relationshipServiceUrl: validTarget(relationshipServiceUrl, "RELATIONSHIP_SERVICE_URL"),
    statusServiceUrl: validTarget(statusServiceUrl, "STATUS_SERVICE_URL"),
    searchServiceUrl: validTarget(searchServiceUrl, "SEARCH_SERVICE_URL"),
    adminServiceUrl: validTarget(adminServiceUrl, "ADMIN_SERVICE_URL"),
    realtimeHubUrl: validTarget(realtimeHubUrl, "REALTIME_HUB_URL"),
    upstreamConnectTimeoutMs:
      overrides.upstreamConnectTimeoutMs ??
      positiveInteger(process.env.UPSTREAM_CONNECT_TIMEOUT_MS, 5000),
    upstreamRequestTimeoutMs:
      overrides.upstreamRequestTimeoutMs ??
      positiveInteger(process.env.UPSTREAM_REQUEST_TIMEOUT_MS, 30000),
    shutdownTimeoutMs:
      overrides.shutdownTimeoutMs ??
      positiveInteger(process.env.SHUTDOWN_TIMEOUT_MS, 10000),
    trustedProxyHops:
      overrides.trustedProxyHops ??
      nonNegativeInteger(process.env.TRUSTED_PROXY_HOPS, 0),
    logLevel: overrides.logLevel ?? resolveLogLevel(process.env.LOG_LEVEL),
    futureServiceUrls,
  };
}
