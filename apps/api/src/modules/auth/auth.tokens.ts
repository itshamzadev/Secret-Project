import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { jwtVerify, SignJWT, type JWTPayload } from "jose";

import { env } from "../../config/env.js";

export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  sid: string;
}

export function createSessionId(): string {
  return randomBytes(24).toString("base64url");
}

export function createRefreshToken(sessionId: string): string {
  return `${sessionId}.${randomBytes(48).toString("base64url")}`;
}

export function extractSessionId(refreshToken: string): string | null {
  const parts = refreshToken.split(".");
  const sessionId = parts.length === 2 ? parts[0] : undefined;

  if (sessionId === undefined || !/^[A-Za-z0-9_-]+$/.test(sessionId)) {
    return null;
  }

  return sessionId;
}

export function hashRefreshToken(refreshToken: string): string {
  return createHmac("sha256", env.JWT_REFRESH_SECRET)
    .update(refreshToken)
    .digest("hex");
}

export function refreshTokenHashesMatch(
  presentedHash: string,
  storedHash: string,
): boolean {
  const presentedBuffer = Buffer.from(presentedHash, "utf8");
  const storedBuffer = Buffer.from(storedHash, "utf8");

  return (
    presentedBuffer.length === storedBuffer.length &&
    timingSafeEqual(presentedBuffer, storedBuffer)
  );
}

export async function createAccessToken(
  userId: string,
  sessionId: string,
): Promise<string> {
  const expiresAt =
    Math.floor(Date.now() / 1000) + env.ACCESS_TOKEN_TTL_SECONDS;

  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setJti(randomBytes(16).toString("base64url"))
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
}

export async function verifyAccessToken(
  accessToken: string,
): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify<AccessTokenClaims>(
    accessToken,
    new TextEncoder().encode(env.JWT_ACCESS_SECRET),
    {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      algorithms: ["HS256"],
    },
  );

  if (typeof payload.sub !== "string" || typeof payload.sid !== "string") {
    throw new Error("Access token claims are incomplete");
  }

  return payload;
}

export function getRefreshTokenExpiry(): Date {
  return new Date(
    Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
}
