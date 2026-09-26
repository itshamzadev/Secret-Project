import { SignJWT } from "jose";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../src/config/env.js";
import { createNotificationApp } from "../src/app.js";
import { verifyAccessToken } from "../src/auth/jwt.js";
import { NotificationService, notificationPreview } from "../src/modules/notifications/notification.service.js";
import { ExpoPushProvider } from "../src/modules/notifications/expo.provider.js";
import type { ExpoDeliveryResult, NotificationIntent, NotificationProvider, NotificationRecord, NotificationRepository, PushDeviceRecord, PushDeviceRepository } from "../src/modules/notifications/notification.types.js";

const alice = "507f1f77bcf86cd799439011";
const bob = "507f1f77bcf86cd799439012";

class MemoryDevices implements PushDeviceRepository {
  readonly values = new Map<string, PushDeviceRecord>();
  async register(userId: string, input: { pushToken: string; platform: "android"; deviceId: string | null }): Promise<PushDeviceRecord> {
    const now = new Date().toISOString();
    const value = { id: `device-${this.values.size + 1}`, userId, pushToken: input.pushToken, platform: input.platform, deviceId: input.deviceId, enabled: true, createdAt: now, updatedAt: now } satisfies PushDeviceRecord;
    const existing = [...this.values.values()].find((item) => item.pushToken === input.pushToken);
    this.values.set(input.pushToken, existing === undefined ? value : { ...existing, userId, deviceId: input.deviceId, enabled: true, updatedAt: now });
    return this.values.get(input.pushToken) as PushDeviceRecord;
  }
  async remove(userId: string, pushToken: string): Promise<boolean> {
    const value = this.values.get(pushToken);
    if (value?.userId !== userId) return false;
    this.values.delete(pushToken);
    return true;
  }
  async disable(tokens: string[]): Promise<void> { for (const token of tokens) { const value = this.values.get(token); if (value !== undefined) this.values.set(token, { ...value, enabled: false }); } }
  async enabledForUser(userId: string): Promise<PushDeviceRecord[]> { return [...this.values.values()].filter((value) => value.userId === userId && value.enabled); }
}

class MemoryNotifications implements NotificationRepository {
  readonly values = new Map<string, NotificationRecord>();
  private sequence = 0;
  async createOrGet(intent: NotificationIntent): Promise<{ record: NotificationRecord; duplicate: boolean }> {
    const existing = [...this.values.values()].find((value) => value.recipientUserId === intent.recipientUserId && value.deduplicationKey === intent.deduplicationKey);
    if (existing !== undefined) return { record: existing, duplicate: true };
    const record: NotificationRecord = { id: `notification-${++this.sequence}`, recipientUserId: intent.recipientUserId, type: intent.type, title: intent.title, body: intent.body, data: intent.data, channelId: intent.channelId, deduplicationKey: intent.deduplicationKey, status: "pending", attempts: 0, nextAttemptAt: null, lastErrorCode: null, providerTicketIds: [], activeDeviceCount: 0 };
    this.values.set(record.id, record);
    return { record, duplicate: false };
  }
  async claim(id: string): Promise<NotificationRecord | null> { const value = this.values.get(id); if (value === undefined || (value.status !== "pending" && value.status !== "retry")) return null; const claimed = { ...value, status: "processing" as const, attempts: value.attempts + 1 }; this.values.set(id, claimed); return claimed; }
  async claimNext(): Promise<NotificationRecord | null> { const value = [...this.values.values()].find((candidate) => candidate.status === "pending" || candidate.status === "retry"); return value === undefined ? null : this.claim(value.id); }
  async markSent(id: string, details: { activeDeviceCount: number; ticketIds: string[] }): Promise<void> { const value = this.values.get(id); if (value !== undefined) this.values.set(id, { ...value, status: "sent", activeDeviceCount: details.activeDeviceCount, providerTicketIds: details.ticketIds }); }
  async scheduleRetry(id: string, nextAttemptAt: Date, errorCode: string): Promise<void> { const value = this.values.get(id); if (value !== undefined) this.values.set(id, { ...value, status: "retry", nextAttemptAt, lastErrorCode: errorCode }); }
  async markFailed(id: string, errorCode: string): Promise<void> { const value = this.values.get(id); if (value !== undefined) this.values.set(id, { ...value, status: "failed", lastErrorCode: errorCode }); }
}

class FakeProvider implements NotificationProvider {
  calls: Array<Array<{ to: string; title: string; body: string }>> = [];
  fail = false;
  invalid = new Set<string>();
  async send(messages: Array<{ to: string; title: string; body: string; data: Record<string, string>; sound: "default"; priority: "high"; channelId: "messages" | "calls" }>): Promise<ExpoDeliveryResult> {
    this.calls.push(messages.map((message) => ({ to: message.to, title: message.title, body: message.body })));
    if (this.fail) throw new Error("EXPO_TIMEOUT");
    return { ticketSummary: { ticketCount: messages.length, okTicketCount: messages.length, ticketIdCount: messages.length, errorCodes: [] }, receiptStatus: "not_checked", receiptSummary: null, ticketIds: messages.map((_message, index) => `ticket-${index}`), invalidTokens: [...this.invalid] };
  }
}

async function accessToken(userId = alice): Promise<string> {
  return new SignJWT({ sid: "session-1" }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(userId).setIssuer(env.JWT_ISSUER).setAudience(env.JWT_AUDIENCE).setIssuedAt().setExpirationTime("10m").sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
}

async function serviceToken(serviceName = "message-server"): Promise<string> {
  return new SignJWT({ serviceName }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(serviceName).setIssuer(env.INTERNAL_SERVICE_ISSUER).setAudience(env.INTERNAL_SERVICE_AUDIENCE).setIssuedAt().setExpirationTime("1m").sign(new TextEncoder().encode(env.INTERNAL_SERVICE_SECRET));
}

function fixture() {
  const devices = new MemoryDevices();
  const notifications = new MemoryNotifications();
  const provider = new FakeProvider();
  const service = new NotificationService(notifications, devices, provider);
  const app = createNotificationApp({ service, devices, databaseStatus: () => "connected", redisStatus: () => "connected", authenticateUser: async (token) => (await verifyAccessToken(token)).sub });
  return { app, devices, notifications, provider, service };
}

describe("notification server", () => {
  beforeEach(() => undefined);

  it("reports health and readiness without a database or Redis connection", async () => {
    const { app } = fixture();
    expect((await request(app).get("/health")).status).toBe(200);
    const ready = await request(app).get("/ready");
    expect(ready.status).toBe(200);
    expect(ready.body.data.dependencies).toEqual({ database: "connected", redis: "connected" });
  });

  it("reports not-ready dependencies safely", async () => {
    const { service, devices } = fixture();
    const app = createNotificationApp({ service, devices, databaseStatus: () => "disconnected", redisStatus: () => "connected", authenticateUser: async (token) => (await verifyAccessToken(token)).sub });
    const response = await request(app).get("/ready");
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain("mongodb");
  });

  it("registers, updates, and removes a device using the existing public contract", async () => {
    const { app } = fixture();
    const token = await accessToken();
    const registration = await request(app).post("/api/v1/notifications/devices").set("Authorization", `Bearer ${token}`).send({ pushToken: "ExpoPushToken[device-a]", platform: "android", deviceId: "phone-a" });
    expect(registration.status).toBe(200);
    expect(registration.body.data.device).toMatchObject({ platform: "android", deviceId: "phone-a", enabled: true, createdAt: expect.any(String), updatedAt: expect.any(String) });
    expect(registration.body.data.device.pushToken).toBeUndefined();
    const removed = await request(app).delete("/api/v1/notifications/devices").set("Authorization", `Bearer ${token}`).send({ pushToken: "ExpoPushToken[device-a]" });
    expect(removed.body).toEqual({ success: true, data: { removed: true } });
  });

  it("rejects malformed and expired user access tokens", async () => {
    const { app } = fixture();
    expect((await request(app).post("/api/v1/notifications/devices").set("Authorization", "Bearer malformed").send({ pushToken: "ExpoPushToken[x]", platform: "android" })).status).toBe(401);
    const expired = await new SignJWT({ sid: "session-1" }).setProtectedHeader({ alg: "HS256" }).setSubject(alice).setIssuer(env.JWT_ISSUER).setAudience(env.JWT_AUDIENCE).setExpirationTime("0s").sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
    expect((await request(app).post("/api/v1/notifications/devices").set("Authorization", `Bearer ${expired}`).send({ pushToken: "ExpoPushToken[x]", platform: "android" })).status).toBe(401);
  });

  it("accepts only authenticated internal notification intents", async () => {
    const { app, notifications, provider, devices } = fixture();
    await devices.register(bob, { pushToken: "ExpoPushToken[bob]", platform: "android", deviceId: null });
    const body = { recipientUserId: bob, type: "message", title: "Alice", body: "New encrypted message", data: { type: "message", conversationId: "conversation-1", senderId: alice, messageId: "message-1" }, channelId: "messages", deduplicationKey: "terqivo:push:message:message-1" };
    expect((await request(app).post("/internal/notifications").send(body)).status).toBe(401);
    const response = await request(app).post("/internal/notifications").set("x-internal-service-token", await serviceToken()).send(body);
    expect(response.status).toBe(202);
    expect(response.body.data.notificationId).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(provider.calls[0]?.[0]).toMatchObject({ to: "ExpoPushToken[bob]", body: "New encrypted message" });
    expect(notifications.values.size).toBe(1);
  });

  it("keeps the existing diagnostic response shape", async () => {
    const { app, devices } = fixture();
    await devices.register(alice, { pushToken: "ExpoPushToken[diagnostic]", platform: "android", deviceId: null });
    const response = await request(app).post("/api/v1/notifications/diagnostics/test-push").set("Authorization", `Bearer ${await accessToken()}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ activeDeviceCount: 1, expoTicketStatus: "ok", ticketIdPresent: true });
  });

  it("rejects a service token from an unapproved service identity", async () => {
    const { app } = fixture();
    const response = await request(app).post("/internal/notifications").set("x-internal-service-token", await serviceToken("search-server")).send({ recipientUserId: bob, type: "diagnostic", title: "Test", body: "Test", data: { type: "diagnostic" }, channelId: "messages", deduplicationKey: "identity-1" });
    expect(response.status).toBe(401);
  });

  it("is idempotent and isolates recipients", async () => {
    const { service, notifications, devices, provider } = fixture();
    await devices.register(alice, { pushToken: "ExpoPushToken[alice]", platform: "android", deviceId: null });
    await devices.register(bob, { pushToken: "ExpoPushToken[bob]", platform: "android", deviceId: null });
    const intent: NotificationIntent = { recipientUserId: bob, type: "incoming_call", title: "Incoming voice call", body: "Alice is calling you", data: { type: "incoming_call", callId: "call-1", callerId: alice, callType: "voice" }, channelId: "calls", deduplicationKey: "terqivo:push:call:call-1" };
    const first = await service.enqueue(intent);
    const second = await notifications.createOrGet(intent);
    expect(first.record.id).toBe(second.record.id);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(provider.calls.flat().every((message) => message.to === "ExpoPushToken[bob]")).toBe(true);
  });

  it("disables invalid Expo tokens without logging or returning them", async () => {
    const { service, devices, provider } = fixture();
    await devices.register(bob, { pushToken: "ExpoPushToken[invalid]", platform: "android", deviceId: null });
    provider.invalid.add("ExpoPushToken[invalid]");
    await service.enqueue({ recipientUserId: bob, type: "diagnostic", title: "Test", body: "Push notifications are working.", data: { type: "diagnostic" }, channelId: "messages", deduplicationKey: "diagnostic-1" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await devices.enabledForUser(bob)).toHaveLength(0);
    expect(JSON.stringify(provider.calls)).toContain("ExpoPushToken[invalid]");
  });

  it("moves transient provider failures into retry state and then succeeds", async () => {
    const { service, devices, provider, notifications } = fixture();
    await devices.register(bob, { pushToken: "ExpoPushToken[bob]", platform: "android", deviceId: null });
    provider.fail = true;
    const result = await service.enqueue({ recipientUserId: bob, type: "message", title: "Alice", body: "New encrypted message", data: { type: "message", conversationId: "conversation-1", senderId: alice }, channelId: "messages", deduplicationKey: "retry-1" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(notifications.values.get(result.record.id)?.status).toBe("retry");
    provider.fail = false;
    await service.processOne();
    expect(notifications.values.get(result.record.id)?.status).toBe("sent");
  });

  it("keeps encrypted notification previews generic", () => {
    expect(notificationPreview({ e2efeVersion: "terqivo-e2efe-v1", type: "text", text: "secret" })).toBe("New encrypted message");
  });

  it("keeps Expo requests within the provider batch limit", async () => {
    const requests: unknown[][] = [];
    vi.stubGlobal("fetch", async (_input: unknown, init: { body?: unknown }) => {
      const messages = JSON.parse(String(init.body)) as unknown[];
      requests.push(messages);
      return new Response(JSON.stringify({ data: messages.map((_message, index) => ({ status: "ok", id: `ticket-${index}` })) }), { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
      const messages = Array.from({ length: 101 }, (_value, index) => ({ to: `ExpoPushToken[test-${index}]`, title: "Test", body: "Test", data: { type: "diagnostic" }, sound: "default" as const, priority: "high" as const, channelId: "messages" as const }));
      const result = await new ExpoPushProvider().send(messages);
      expect(requests.map((batch) => batch.length)).toEqual([100, 1]);
      expect(result.ticketSummary.ticketCount).toBe(101);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
