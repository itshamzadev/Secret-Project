import { jwtVerify, SignJWT } from "jose";

import { env } from "../config/env.js";
import { RealtimeError } from "../core/errors.js";

export interface ServiceTokenClaims {
  serviceName: string;
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
}

const key = new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET);

export function issueServiceToken(subject = env.SERVICE_NAME): Promise<string> {
  return new SignJWT({ serviceName: env.SERVICE_NAME })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(env.INTERNAL_SERVICE_ISSUER)
    .setAudience(env.INTERNAL_SERVICE_AUDIENCE)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
    .sign(key);
}

export async function verifyServiceToken(
  token: string | undefined,
  expectedServiceName: string,
): Promise<ServiceTokenClaims> {
  if (token === undefined || token.length === 0) {
    throw new RealtimeError("INTERNAL_SERVICE_UNAUTHORIZED", "Internal service authentication is required.", 401);
  }
  try {
    const result = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      issuer: env.INTERNAL_SERVICE_ISSUER,
      audience: env.INTERNAL_SERVICE_AUDIENCE,
      clockTolerance: 5
    });
    if (result.payload.serviceName !== expectedServiceName) {
      throw new Error("Unexpected service identity");
    }
    return result.payload as unknown as ServiceTokenClaims;
  } catch {
    throw new RealtimeError("INTERNAL_SERVICE_UNAUTHORIZED", "Internal service authentication is required.", 401);
  }
}
