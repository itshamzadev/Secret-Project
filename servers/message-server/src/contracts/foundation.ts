/**
 * Contracts shared by the current API and future independently deployable
 * services. These types intentionally contain no persistence or business
 * logic.
 */

export interface RequestContext {
  requestId: string;
  correlationId: string;
}

export interface ServiceIdentity {
  serviceName: string;
  instanceId?: string;
}

export type DependencyHealth = "connected" | "disconnected" | "unknown";

export interface ServiceHealthResponse {
  status: "ok" | "degraded";
  serviceName: string;
  version?: string;
  uptime: number;
  dependencies?: Record<string, DependencyHealth>;
}

export interface CursorPagination {
  nextCursor: string | null;
}

export interface InternalServiceClaims extends ServiceIdentity {
  issuer: string;
  audience: string;
  issuedAt: number;
  expiresAt: number;
}
