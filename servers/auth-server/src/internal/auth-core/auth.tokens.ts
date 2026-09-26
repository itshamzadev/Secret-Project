import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import { getAuthCoreConfig } from "./config.js";

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
  return sessionId !== undefined && /^[A-Za-z0-9_-]+$/.test(sessionId)
    ? sessionId
    : null;
}
export function hashRefreshToken(refreshToken: string): string {
  return createHmac("sha256", getAuthCoreConfig().jwtRefreshSecret)
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
  const config = getAuthCoreConfig();
  const expiresAt =
    Math.floor(Date.now() / 1000) + config.accessTokenTtlSeconds;
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(config.jwtIssuer)
    .setAudience(config.jwtAudience)
    .setJti(randomBytes(16).toString("base64url"))
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(config.jwtAccessSecret));
}
export async function verifyAccessToken(
  accessToken: string,
): Promise<AccessTokenClaims> {
  const config = getAuthCoreConfig();
  const { payload } = await jwtVerify<AccessTokenClaims>(
    accessToken,
    new TextEncoder().encode(config.jwtAccessSecret),
    {
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      algorithms: ["HS256"],
    },
  );
  if (typeof payload.sub !== "string" || typeof payload.sid !== "string")
    throw new Error("Access token claims are incomplete");
  return payload;
}
export function getRefreshTokenExpiry(): Date {
  return new Date(
    Date.now() + getAuthCoreConfig().refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  );
}
