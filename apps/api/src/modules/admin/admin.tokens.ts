import { randomBytes } from "node:crypto";

import { jwtVerify, SignJWT, type JWTPayload } from "jose";

import { env } from "../../config/env.js";
import { AppError } from "../../core/errors.js";

const adminIssuer = "terqivo-admin";
const adminAudience = "terqivo-admin-panel";

export interface AdminAccessTokenClaims extends JWTPayload {
  sub: string;
}

function adminAuthNotConfigured(): AppError {
  return new AppError({
    code: "ADMIN_AUTH_NOT_CONFIGURED",
    message: "Administrative authentication is not configured.",
    statusCode: 503,
  });
}

function adminSecret(): Uint8Array {
  if (env.ADMIN_JWT_SECRET === undefined) {
    throw adminAuthNotConfigured();
  }
  return new TextEncoder().encode(env.ADMIN_JWT_SECRET);
}

export async function createAdminAccessToken(adminId: string): Promise<string> {
  return new SignJWT({ kind: "admin" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(adminId)
    .setIssuer(adminIssuer)
    .setAudience(adminAudience)
    .setJti(randomBytes(16).toString("base64url"))
    .setIssuedAt()
    .setExpirationTime(
      Math.floor(Date.now() / 1000) + env.ADMIN_ACCESS_TOKEN_TTL_SECONDS,
    )
    .sign(adminSecret());
}

export async function verifyAdminAccessToken(
  accessToken: string,
): Promise<AdminAccessTokenClaims> {
  const { payload } = await jwtVerify<AdminAccessTokenClaims>(
    accessToken,
    adminSecret(),
    {
      issuer: adminIssuer,
      audience: adminAudience,
      algorithms: ["HS256"],
    },
  );

  if (typeof payload.sub !== "string") {
    throw new Error("Admin access token claims are incomplete");
  }

  return payload;
}
