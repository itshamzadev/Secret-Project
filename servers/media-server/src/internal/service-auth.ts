import { jwtVerify, SignJWT } from "jose";

import { env } from "../config/env.js";

export async function requireServiceToken(value: string | undefined, allowedServices: readonly string[]): Promise<void> {
  if (value === undefined || value.trim() === "") throw new Error("INTERNAL_SERVICE_UNAUTHORIZED");
  const result = await jwtVerify(value, new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET), {
    algorithms: ["HS256"],
    issuer: env.INTERNAL_SERVICE_ISSUER,
    audience: env.INTERNAL_SERVICE_AUDIENCE,
    clockTolerance: 5,
  });
  const serviceName = result.payload.serviceName;
  if (typeof serviceName !== "string" || !allowedServices.includes(serviceName)) throw new Error("INTERNAL_SERVICE_UNAUTHORIZED");
}

export function issueServiceToken(serviceName: string): Promise<string> {
  return new SignJWT({ serviceName })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(env.INTERNAL_SERVICE_ISSUER)
    .setAudience(env.INTERNAL_SERVICE_AUDIENCE)
    .setSubject(serviceName)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
    .sign(new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET));
}
