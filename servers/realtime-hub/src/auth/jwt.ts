import { jwtVerify } from "jose";

import { env } from "../config/env.js";
import { RealtimeError } from "../core/errors.js";

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
}

const key = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const result = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE
    });
    if (typeof result.payload.sub !== "string" || typeof result.payload.sid !== "string") {
      throw new Error("Missing token identity");
    }
    return result.payload as unknown as AccessTokenClaims;
  } catch {
    throw new RealtimeError("INVALID_ACCESS_TOKEN", "The access token is invalid or expired.", 401);
  }
}
