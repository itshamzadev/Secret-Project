import { randomBytes } from "node:crypto";
import { jwtVerify, SignJWT, type JWTPayload } from "jose";

import { AppError } from "../core/errors.js";
import type { AdminServerConfig } from "../config/env.js";

export interface AdminAccessTokenClaims extends JWTPayload {
  sub: string;
  kind?: string;
}

export async function createAdminAccessToken(
  config: AdminServerConfig,
  adminId: string,
): Promise<string> {
  return new SignJWT({ kind: "admin" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(adminId)
    .setIssuer(config.ADMIN_JWT_ISSUER)
    .setAudience(config.ADMIN_JWT_AUDIENCE)
    .setJti(randomBytes(16).toString("base64url"))
    .setIssuedAt()
    .setExpirationTime(
      Math.floor(Date.now() / 1000) + config.ADMIN_ACCESS_TOKEN_TTL_SECONDS,
    )
    .sign(new TextEncoder().encode(config.ADMIN_JWT_SECRET));
}

export async function verifyAdminAccessToken(
  config: AdminServerConfig,
  token: string,
): Promise<AdminAccessTokenClaims> {
  try {
    const { payload } = await jwtVerify<AdminAccessTokenClaims>(
      token,
      new TextEncoder().encode(config.ADMIN_JWT_SECRET),
      {
        issuer: config.ADMIN_JWT_ISSUER,
        audience: config.ADMIN_JWT_AUDIENCE,
        algorithms: ["HS256"],
      },
    );
    if (typeof payload.sub !== "string") throw new Error("missing subject");
    return payload;
  } catch {
    throw new AppError({
      code: "INVALID_ADMIN_ACCESS_TOKEN",
      message: "The administrative access token is invalid or expired.",
      statusCode: 401,
    });
  }
}
