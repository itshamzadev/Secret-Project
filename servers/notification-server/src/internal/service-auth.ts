import { jwtVerify, SignJWT } from "jose";

import { env } from "../config/env.js";

export const notificationServiceNames = ["message-server", "call-server", "admin-server"] as const;
export type NotificationServiceName = (typeof notificationServiceNames)[number];

export async function createServiceToken(serviceName: NotificationServiceName): Promise<string> {
  return new SignJWT({ serviceName })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(env.INTERNAL_SERVICE_ISSUER)
    .setAudience(env.INTERNAL_SERVICE_AUDIENCE)
    .setSubject(serviceName)
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET));
}

export async function verifyServiceToken(value: string | undefined): Promise<NotificationServiceName> {
  if (value === undefined || value.trim() === "") throw new Error("INTERNAL_SERVICE_UNAUTHORIZED");
  const result = await jwtVerify(value, new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET), {
    algorithms: ["HS256"],
    issuer: env.INTERNAL_SERVICE_ISSUER,
    audience: env.INTERNAL_SERVICE_AUDIENCE,
    clockTolerance: 5,
  });
  const serviceName = result.payload.serviceName;
  if (typeof serviceName !== "string" || !notificationServiceNames.includes(serviceName as NotificationServiceName)) {
    throw new Error("INTERNAL_SERVICE_UNAUTHORIZED");
  }
  return serviceName as NotificationServiceName;
}
