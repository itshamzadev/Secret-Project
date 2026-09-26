import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createRelationshipApp } from "../src/app.js";
import { createServiceToken } from "../src/auth/service-token.js";
import type { AuthDirectoryClient, AuthContext, PublicUser } from "../src/clients/auth-directory.js";
import type { RelationshipService } from "../src/modules/relationships/relationship.service.js";

const userId = "507f1f77bcf86cd799439011";
const otherId = "507f1f77bcf86cd799439012";
const publicUser: PublicUser = { id: otherId, username: "bob", displayName: "Bob", phone: null, avatarUrl: null, bio: null, accountType: "personal", badges: [], accountStatus: "active" };

function app() {
  const auth = { validateAccessToken: vi.fn(async (_token: string): Promise<AuthContext> => ({ userId, sessionId: "session" })), resolveIdentifier: vi.fn(async (_identifier: string) => publicUser), batchPublicUsers: vi.fn(async (_ids: string[]) => [publicUser]), searchUsers: vi.fn(async (_query: string) => [publicUser]) } as unknown as AuthDirectoryClient;
  const service = { addContact: vi.fn(async () => ({ id: "contact", contactUser: publicUser, customName: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })), listContacts: vi.fn(async () => ({ contacts: [], nextCursor: null })), updateContact: vi.fn(async () => ({ id: "contact", contactUser: publicUser, customName: "Bobby", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })), removeContact: vi.fn(async () => undefined), blockUser: vi.fn(async () => undefined), unblockUser: vi.fn(async () => true), check: vi.fn(async () => ({ blocked: false, areContacts: true })), statusVisibility: vi.fn(async (_viewerId: string, ownerIds: string[]) => ownerIds.map((ownerId) => ({ ownerId, blocked: false, areContacts: true }))), contactRelations: vi.fn(async () => []) } as unknown as RelationshipService;
  return { server: createRelationshipApp({ authClient: auth, service, databaseStatus: () => "connected" }), service };
}

describe("Relationship Server contracts", () => {
  it("keeps health/readiness operational and does not expose database details", async () => {
    const response = await request(app().server).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.data.serviceName).toBe("relationship-server-test");
    expect(JSON.stringify(response.body)).not.toContain("mongodb://");
    expect((await request(app().server).get("/ready")).status).toBe(200);
  });

  it("requires a valid service token for internal relationship policy", async () => {
    const response = await request(app().server).post("/internal/relationships/check").send({ firstUserId: userId, secondUserId: otherId });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INTERNAL_SERVICE_UNAUTHORIZED");
  });

  it("accepts a valid service token and returns policy facts", async () => {
    const { server } = app();
    const token = await createServiceToken("message-server");
    const response = await request(server).post("/internal/relationships/check").set("x-internal-service-token", token).send({ firstUserId: userId, secondUserId: otherId });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ blocked: false, areContacts: true });
  });

  it("exposes narrow status visibility facts to the Status Server", async () => {
    const { server, service } = app();
    const token = await createServiceToken("status-server");
    const response = await request(server).post("/internal/relationships/status-visibility").set("x-internal-service-token", token).send({ viewerId: userId, ownerIds: [otherId] });
    expect(response.status).toBe(200);
    expect(response.body.data.visibility).toEqual([{ ownerId: otherId, blocked: false, areContacts: true }]);
    expect(service.statusVisibility).toHaveBeenCalledWith(userId, [otherId]);
  });

  it("keeps the public contact and block contracts behind user authentication", async () => {
    const { server, service } = app();
    const contact = await request(server).post("/api/v1/contacts").set("Authorization", "Bearer access").send({ identifier: "bob" });
    expect(contact.status).toBe(201);
    expect(service.addContact).toHaveBeenCalledWith(userId, "bob", undefined);
    const blocked = await request(server).put(`/api/v1/users/${otherId}/block`).set("Authorization", "Bearer access");
    expect(blocked.status).toBe(200);
    expect(service.blockUser).toHaveBeenCalledWith(userId, otherId);
  });

  it("preserves privacy between owners by delegating identity validation", async () => {
    const { server, service } = app();
    const response = await request(server).get("/api/v1/contacts").set("Authorization", "Bearer access");
    expect(response.status).toBe(200);
    expect(service.listContacts).toHaveBeenCalledWith(userId, { limit: 50 });
  });
});
