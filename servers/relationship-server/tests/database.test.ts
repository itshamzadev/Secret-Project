import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AuthContext, AuthDirectoryClient, PublicUser } from "../src/clients/auth-directory.js";
import { connectDatabase, disconnectDatabase } from "../src/lib/database.js";
import { ContactModel } from "../src/models/contact.model.js";
import { UserBlockModel } from "../src/models/block.model.js";
import { RelationshipService } from "../src/modules/relationships/relationship.service.js";

const ownerId = "507f1f77bcf86cd799439011";
const targetId = "507f1f77bcf86cd799439012";
const target: PublicUser = { id: targetId, username: "relationship-target", displayName: "Relationship Target", phone: null, avatarUrl: null, bio: null, accountType: "personal", badges: [], accountStatus: "active" };

const auth = {
  validateAccessToken: async (_token: string): Promise<AuthContext> => ({ userId: ownerId, sessionId: "session" }),
  resolveIdentifier: async (_identifier: string): Promise<PublicUser> => target,
  batchPublicUsers: async (_ids: string[]): Promise<PublicUser[]> => [target],
  searchUsers: async (_query: string): Promise<PublicUser[]> => [target],
} as unknown as AuthDirectoryClient;
const service = new RelationshipService(auth);

beforeAll(async () => { await connectDatabase(); await Promise.all([ContactModel.init(), UserBlockModel.init()]); });
beforeEach(async () => { await Promise.all([ContactModel.deleteMany({}), UserBlockModel.deleteMany({})]); });
afterAll(async () => { await disconnectDatabase(); });

describe("Relationship Server Mongo ownership", () => {
  it("persists contact ownership and returns relationship policy facts", async () => {
    const created = await service.addContact(ownerId, "relationship-target");
    expect(created.contactUser.id).toBe(targetId);
    expect((await service.listContacts(ownerId, { limit: 50 })).contacts).toHaveLength(1);
    expect(await service.check(ownerId, targetId)).toEqual({ blocked: false, areContacts: true });
    await service.blockUser(ownerId, targetId);
    expect(await service.check(ownerId, targetId)).toEqual({ blocked: true, areContacts: true });
    expect(await service.unblockUser(ownerId, targetId)).toBe(true);
  });
});
