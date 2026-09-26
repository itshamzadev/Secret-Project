import { SignJWT } from "jose";

import { env } from "../config/env.js";
import { AppError } from "../core/errors.js";

interface RelationshipCheck { blocked: boolean; areContacts: boolean; }
interface ContactRelation { contactUserId: string; customName: string | null; }

async function serviceToken(): Promise<string> {
  if (env.INTERNAL_SERVICE_SECRET === undefined) throw new AppError({ code: "RELATIONSHIP_SERVICE_UNAVAILABLE", message: "Relationship service is unavailable.", statusCode: 503 });
  return new SignJWT({ serviceName: "message-server" }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuer(env.INTERNAL_SERVICE_ISSUER).setAudience(env.INTERNAL_SERVICE_AUDIENCE).setSubject("message-server").setIssuedAt().setExpirationTime("60s").sign(new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET));
}

async function request<T>(path: string, body: unknown): Promise<T> {
  if (env.RELATIONSHIP_SERVICE_URL === undefined) throw new AppError({ code: "RELATIONSHIP_SERVICE_UNAVAILABLE", message: "Relationship service is unavailable.", statusCode: 503 });
  const token = await serviceToken();
  try {
    const response = await fetch(`${env.RELATIONSHIP_SERVICE_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "x-internal-service-token": token }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    const payload = await response.json().catch(() => undefined) as { success?: boolean; data?: T; error?: { code?: string; message?: string } } | undefined;
    if (!response.ok || payload?.success !== true || payload.data === undefined) {
      if (response.status === 403 && payload?.error?.code === "INTERACTION_BLOCKED") throw new AppError({ code: "INTERACTION_BLOCKED", message: "This interaction is unavailable.", statusCode: 403 });
      throw new Error("relationship request failed");
    }
    return payload.data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError({ code: "RELATIONSHIP_SERVICE_UNAVAILABLE", message: "Relationship service is unavailable.", statusCode: 503 });
  }
}

export async function getRelationshipPolicy(firstUserId: string, secondUserId: string): Promise<RelationshipCheck> { return request<RelationshipCheck>("/internal/relationships/check", { firstUserId, secondUserId }); }
export async function isUserBlockedEitherDirection(firstUserId: string, secondUserId: string): Promise<boolean> { return (await getRelationshipPolicy(firstUserId, secondUserId)).blocked; }
export async function assertUsersCanInteract(firstUserId: string, secondUserId: string): Promise<void> { if ((await getRelationshipPolicy(firstUserId, secondUserId)).blocked) throw new AppError({ code: "INTERACTION_BLOCKED", message: "This interaction is unavailable.", statusCode: 403 }); }
export async function getContactRelations(ownerId: string, contactUserIds: string[]): Promise<Map<string, string | null>> { const result = await request<{ contacts: ContactRelation[] }>("/internal/relationships/contacts/batch", { ownerId, contactUserIds }); return new Map(result.contacts.map((contact) => [contact.contactUserId, contact.customName])); }
export async function areContacts(ownerId: string, contactUserIds: string[]): Promise<boolean> { return (await getContactRelations(ownerId, contactUserIds)).size === contactUserIds.length; }
