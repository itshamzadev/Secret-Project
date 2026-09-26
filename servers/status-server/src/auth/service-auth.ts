import { SignJWT } from "jose";

import type { StatusServerConfig } from "../config.js";

export async function issueServiceToken(config: StatusServerConfig): Promise<string> {
  if (config.INTERNAL_SERVICE_SECRET === undefined) throw new Error("INTERNAL_SERVICE_AUTH_NOT_CONFIGURED");
  return new SignJWT({ serviceName: config.SERVICE_NAME })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(config.INTERNAL_SERVICE_ISSUER)
    .setAudience(config.INTERNAL_SERVICE_AUDIENCE)
    .setSubject(config.SERVICE_NAME)
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(config.INTERNAL_SERVICE_SECRET));
}
