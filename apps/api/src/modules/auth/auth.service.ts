import { configureAuthCore } from "@terqivo/auth-core";

import { env } from "../../config/env.js";
import { disconnectSessionSockets } from "../../sockets/session-registry.js";

configureAuthCore({
  jwtAccessSecret: env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: env.JWT_REFRESH_SECRET,
  jwtIssuer: env.JWT_ISSUER,
  jwtAudience: env.JWT_AUDIENCE,
  accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
  refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
  onSessionRevoked: disconnectSessionSockets,
});

export * from "@terqivo/auth-core";
