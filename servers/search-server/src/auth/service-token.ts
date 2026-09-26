import { SignJWT } from "jose";

import { env } from "../config/env.js";

export async function createServiceToken(): Promise<string> {
  if (env.INTERNAL_SERVICE_SECRET === undefined) throw new Error("INTERNAL_SERVICE_AUTH_NOT_CONFIGURED");
  return new SignJWT({ serviceName: "search-server" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(env.INTERNAL_SERVICE_ISSUER)
    .setAudience(env.INTERNAL_SERVICE_AUDIENCE)
    .setSubject("search-server")
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET));
}
