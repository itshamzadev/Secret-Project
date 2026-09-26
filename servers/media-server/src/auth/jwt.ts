import { jwtVerify, type JWTPayload } from "jose";

import { env } from "../config/env.js";
import type { AuthContext } from "./types.js";

interface AccessPayload extends JWTPayload {
  sessionId?: unknown;
}

export async function verifyAccessToken(value: string): Promise<AuthContext> {
  const result = await jwtVerify(value, new TextEncoder().encode(env.JWT_ACCESS_SECRET), {
    algorithms: ["HS256"],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    clockTolerance: 5,
  });
  const subject = result.payload.sub;
  const sessionId = (result.payload as AccessPayload).sessionId;
  if (typeof subject !== "string" || typeof sessionId !== "string" || subject.length === 0 || sessionId.length === 0) {
    throw new Error("Invalid access token claims");
  }
  return { userId: subject, sessionId };
}
