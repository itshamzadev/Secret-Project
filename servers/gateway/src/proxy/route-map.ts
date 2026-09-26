import type { GatewayConfig } from "../config.js";

export interface GatewayRoute {
  readonly prefix: string;
  readonly logicalService: string;
  readonly futureTargetEnvironment?: string;
}

export const socketIoRoute: GatewayRoute = {
  prefix: "/socket.io",
  logicalService: "realtime-hub",
  futureTargetEnvironment: "REALTIME_HUB_URL",
};

export const gatewayRoutes: readonly GatewayRoute[] = [
  { prefix: "/api/v1/auth", logicalService: "auth-server", futureTargetEnvironment: "AUTH_SERVICE_URL" },
  { prefix: "/api/v1/users/me/profile", logicalService: "auth-server", futureTargetEnvironment: "AUTH_SERVICE_URL" },
  { prefix: "/api/v1/users/me/privacy", logicalService: "auth-server", futureTargetEnvironment: "AUTH_SERVICE_URL" },
  { prefix: "/api/v1/users", logicalService: "auth-server", futureTargetEnvironment: "AUTH_SERVICE_URL" },
  { prefix: "/api/v1/contacts", logicalService: "relationship-server", futureTargetEnvironment: "RELATIONSHIP_SERVICE_URL" },
  { prefix: "/api/v1/conversations", logicalService: "message-server", futureTargetEnvironment: "MESSAGE_SERVICE_URL" },
  { prefix: "/api/v1/messages", logicalService: "message-server", futureTargetEnvironment: "MESSAGE_SERVICE_URL" },
  { prefix: "/api/v1/groups", logicalService: "message-server", futureTargetEnvironment: "MESSAGE_SERVICE_URL" },
  { prefix: "/api/v1/channels", logicalService: "message-server", futureTargetEnvironment: "MESSAGE_SERVICE_URL" },
  { prefix: "/api/v1/calls", logicalService: "call-server", futureTargetEnvironment: "CALL_SERVICE_URL" },
  { prefix: "/api/v1/media", logicalService: "media-server", futureTargetEnvironment: "MEDIA_SERVICE_URL" },
  { prefix: "/api/v1/notifications", logicalService: "notification-server", futureTargetEnvironment: "NOTIFICATION_SERVICE_URL" },
  { prefix: "/api/v1/search", logicalService: "search-server", futureTargetEnvironment: "SEARCH_SERVICE_URL" },
  { prefix: "/api/v1/ai", logicalService: "search-server", futureTargetEnvironment: "SEARCH_SERVICE_URL" },
  { prefix: "/api/v1/admin", logicalService: "admin-server", futureTargetEnvironment: "ADMIN_SERVICE_URL" },
  { prefix: "/api/v1/reports", logicalService: "admin-server", futureTargetEnvironment: "ADMIN_SERVICE_URL" },
  { prefix: "/api/v1/e2efe", logicalService: "message-server", futureTargetEnvironment: "MESSAGE_SERVICE_URL" },
  { prefix: "/api/v1/status", logicalService: "status-server", futureTargetEnvironment: "STATUS_SERVICE_URL" },
];

export function routeForPath(pathname: string): GatewayRoute | undefined {
  if (/^\/api\/v1\/users\/[^/]+\/block\/?$/.test(pathname)) {
    return { prefix: "/api/v1/users/:userId/block", logicalService: "relationship-server", futureTargetEnvironment: "RELATIONSHIP_SERVICE_URL" };
  }
  if (/^\/api\/v1\/conversations\/[^/]+\/media(?:\/encrypted\/upload)?$/.test(pathname)) {
    return { prefix: "/api/v1/conversation-media", logicalService: "media-server", futureTargetEnvironment: "MEDIA_SERVICE_URL" };
  }
  if (/^\/api\/v1\/conversations\/[^/]+\/messages\/encrypted-media$/.test(pathname)) {
    return { prefix: "/api/v1/encrypted-media-message", logicalService: "message-server", futureTargetEnvironment: "MESSAGE_SERVICE_URL" };
  }
  return gatewayRoutes.find(
    (route) => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`),
  );
}

export function isSocketIoPath(pathname: string): boolean {
  return pathname === "/socket.io" || pathname.startsWith("/socket.io/");
}

export function routeTarget(
  route: GatewayRoute,
  config: GatewayConfig,
): string {
  if (route.logicalService === "auth-server") return config.authServiceUrl;
  if (route.logicalService === "message-server") return config.messageServiceUrl;
  if (route.logicalService === "call-server") return config.callServiceUrl;
  if (route.logicalService === "media-server") return config.mediaServiceUrl;
  if (route.logicalService === "notification-server") return config.notificationServiceUrl;
  if (route.logicalService === "relationship-server") return config.relationshipServiceUrl;
  if (route.logicalService === "status-server") return config.statusServiceUrl;
  if (route.logicalService === "search-server") return config.searchServiceUrl;
  if (route.logicalService === "admin-server") return config.adminServiceUrl;
  if (route.logicalService === "realtime-hub") return config.realtimeHubUrl;
  throw new Error(`No configured target for logical service: ${route.logicalService}`);
}
