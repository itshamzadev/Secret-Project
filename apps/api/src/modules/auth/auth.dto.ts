import type { AuthSessionDto } from "@terqivo/contracts";

import type { AuthSessionDocument } from "./auth-session.model.js";

export function toAuthSessionDto(
  session: AuthSessionDocument,
  currentSessionId: string,
): AuthSessionDto {
  return {
    id: session.sessionId,
    deviceId: session.deviceId,
    deviceName: session.deviceName,
    platform: session.platform,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt.toISOString(),
    lastRefreshAt: session.lastRefreshAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    current: session.sessionId === currentSessionId,
  };
}
