import { jwtVerify, type JWTPayload } from "jose";
import { env } from "../../config/env.js";

export interface AccessTokenClaims extends JWTPayload { sub: string; sid: string; }
export async function verifyAccessToken(accessToken: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify<AccessTokenClaims>(accessToken, new TextEncoder().encode(env.JWT_ACCESS_SECRET), { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, algorithms: ["HS256"] });
  if (typeof payload.sub !== "string" || typeof payload.sid !== "string") throw new Error("Access token claims are incomplete");
  return payload;
}
