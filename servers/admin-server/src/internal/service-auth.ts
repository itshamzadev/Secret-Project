import { SignJWT, jwtVerify } from "jose";

import type { AdminServerConfig } from "../config/env.js";
import { AppError } from "../core/errors.js";

export async function issueServiceToken(config: AdminServerConfig): Promise<string> {
  return new SignJWT({ serviceName: "admin-server" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(config.INTERNAL_SERVICE_ISSUER)
    .setAudience(config.INTERNAL_SERVICE_AUDIENCE)
    .setSubject("admin-server")
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(config.INTERNAL_SERVICE_SECRET));
}

export function requireInternalService(config: AdminServerConfig, allowed: readonly string[] = ["admin-server"]): (request: { get(name: string): string | undefined }, _response: unknown, next: (error?: unknown) => void) => void {
  return (request, _response, next) => {
    void (async () => {
      const token = request.get("x-internal-service-token");
      if (token === undefined) throw new Error("missing token");
      const { payload } = await jwtVerify(token, new TextEncoder().encode(config.INTERNAL_SERVICE_SECRET), { issuer: config.INTERNAL_SERVICE_ISSUER, audience: config.INTERNAL_SERVICE_AUDIENCE, algorithms: ["HS256"], clockTolerance: 5 });
      if (typeof payload.serviceName !== "string" || !allowed.includes(payload.serviceName)) throw new Error("service not allowed");
      next();
    })().catch(() => next(new AppError({ code: "INTERNAL_SERVICE_UNAUTHORIZED", message: "Internal service authentication is required.", statusCode: 401 })));
  };
}
