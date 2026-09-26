import { SignJWT } from "jose";

import { env } from "../../config/env.js";
import { AppError } from "../../core/errors.js";

async function relationshipCheck(firstUserId: string, secondUserId: string): Promise<boolean> {
  if (env.RELATIONSHIP_SERVICE_URL === undefined || env.INTERNAL_SERVICE_SECRET === undefined) throw new AppError({ code: "RELATIONSHIP_SERVICE_UNAVAILABLE", message: "Relationship service is unavailable.", statusCode: 503 });
  try {
    const token = await new SignJWT({ serviceName: "call-server" }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuer(env.INTERNAL_SERVICE_ISSUER).setAudience(env.INTERNAL_SERVICE_AUDIENCE).setSubject("call-server").setIssuedAt().setExpirationTime("60s").sign(new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET));
    const response = await fetch(`${env.RELATIONSHIP_SERVICE_URL}/internal/relationships/check`, { method: "POST", headers: { "Content-Type": "application/json", "x-internal-service-token": token }, body: JSON.stringify({ firstUserId, secondUserId }), signal: AbortSignal.timeout(5000) });
    const body = await response.json().catch(() => undefined) as { success?: boolean; data?: { blocked?: boolean } } | undefined;
    if (!response.ok || body?.success !== true || body.data?.blocked === undefined) throw new Error("relationship request failed");
    return body.data.blocked;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError({ code: "RELATIONSHIP_SERVICE_UNAVAILABLE", message: "Relationship service is unavailable.", statusCode: 503 });
  }
}

export async function isUserBlockedEitherDirection(firstUserId: string, secondUserId: string): Promise<boolean> { return relationshipCheck(firstUserId, secondUserId); }
export async function assertUsersCanInteract(firstUserId: string, secondUserId: string): Promise<void> { if (await relationshipCheck(firstUserId, secondUserId)) throw new AppError({ code: "INTERACTION_BLOCKED", message: "This interaction is unavailable.", statusCode: 403 }); }
