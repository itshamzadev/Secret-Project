import { SignJWT, jwtVerify } from "jose";

import { AppError } from "../core/errors.js";
import { env } from "../config/env.js";

export async function createServiceToken(serviceName: string): Promise<string> {
  if (env.INTERNAL_SERVICE_SECRET === undefined) throw new Error("INTERNAL_SERVICE_AUTH_NOT_CONFIGURED");
  return new SignJWT({ serviceName })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(env.INTERNAL_SERVICE_ISSUER)
    .setAudience(env.INTERNAL_SERVICE_AUDIENCE)
    .setSubject(serviceName)
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET));
}

export async function requireServiceToken(value: string | undefined): Promise<string> {
  if (value === undefined || env.INTERNAL_SERVICE_SECRET === undefined) {
    throw new AppError({ code: "INTERNAL_SERVICE_UNAUTHORIZED", message: "Internal service authentication is required.", statusCode: 401 });
  }
  try {
    const { payload } = await jwtVerify<{ serviceName?: unknown }>(value, new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET), {
      issuer: env.INTERNAL_SERVICE_ISSUER,
      audience: env.INTERNAL_SERVICE_AUDIENCE,
      algorithms: ["HS256"],
    });
    const serviceName = typeof payload.serviceName === "string" ? payload.serviceName : payload.sub;
    if (typeof serviceName !== "string" || !["message-server", "call-server", "status-server", "auth-server"].includes(serviceName)) throw new Error("service not allowed");
    return serviceName;
  } catch {
    throw new AppError({ code: "INTERNAL_SERVICE_UNAUTHORIZED", message: "Internal service authentication is required.", statusCode: 401 });
  }
}
