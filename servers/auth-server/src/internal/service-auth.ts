import { jwtVerify, SignJWT } from "jose";
import type { RequestHandler } from "express";

import { AppError } from "./auth-core/contracts.js";
import type { AuthServerConfig } from "../config.js";

export async function issueServiceToken(config: AuthServerConfig, serviceName = config.SERVICE_NAME): Promise<string> {
  if (config.INTERNAL_SERVICE_SECRET === undefined) throw new AppError({ code: "INTERNAL_SERVICE_UNAUTHORIZED", message: "Internal service authentication is required.", statusCode: 503 });
  return new SignJWT({ serviceName }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuer(config.INTERNAL_SERVICE_ISSUER).setAudience(config.INTERNAL_SERVICE_AUDIENCE).setSubject(serviceName).setIssuedAt().setExpirationTime("60s").sign(new TextEncoder().encode(config.INTERNAL_SERVICE_SECRET));
}

export function requireInternalService(
  config: AuthServerConfig,
  allowedServices: readonly string[] = ["relationship-server", "search-server", "status-server", "admin-server", "realtime-hub"],
): RequestHandler {
  return (request, _response, next) => {
    void (async () => {
      if (config.INTERNAL_SERVICE_SECRET === undefined) throw new AppError({ code: "INTERNAL_SERVICE_UNAUTHORIZED", message: "Internal service authentication is required.", statusCode: 401 });
      const token = request.get("x-internal-service-token");
      if (token === undefined) throw new AppError({ code: "INTERNAL_SERVICE_UNAUTHORIZED", message: "Internal service authentication is required.", statusCode: 401 });
      try {
        const { payload } = await jwtVerify<{ serviceName?: unknown }>(token, new TextEncoder().encode(config.INTERNAL_SERVICE_SECRET), { issuer: config.INTERNAL_SERVICE_ISSUER, audience: config.INTERNAL_SERVICE_AUDIENCE, algorithms: ["HS256"] });
        const serviceName = typeof payload.serviceName === "string" ? payload.serviceName : payload.sub;
        if (typeof serviceName !== "string" || !allowedServices.includes(serviceName)) throw new Error("service not allowed");
        next();
      } catch { throw new AppError({ code: "INTERNAL_SERVICE_UNAUTHORIZED", message: "Internal service authentication is required.", statusCode: 401 }); }
    })().catch(next);
  };
}
