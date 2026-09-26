import { jwtVerify, type JWTPayload } from "jose";

import { env } from "../config/env.js";

export interface AccessClaims extends JWTPayload { sub: string; sid: string; }

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const result = await jwtVerify<AccessClaims>(token, new TextEncoder().encode(env.JWT_ACCESS_SECRET), {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    algorithms: ["HS256"],
  });
  if (typeof result.payload.sub !== "string" || typeof result.payload.sid !== "string") throw new Error("Incomplete access token");
  return result.payload;
}
