import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { ContactModel } from "../src/modules/contacts/contact.model.js";
import {
  authData,
  authHeader,
  clearTestData,
  connectTestData,
  disconnectTestData,
  registerPayload,
} from "./test-helpers.js";

const app = createApp();

async function register(overrides: Parameters<typeof registerPayload>[0] = {}) {
  return request(app)
    .post("/api/v1/auth/register")
    .send(registerPayload(overrides));
}

describe("contacts", () => {
  beforeAll(connectTestData);
  beforeEach(clearTestData);
  afterAll(disconnectTestData);

  it("creates owner-specific contacts with custom names", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.Example",
        name: "Bob Example",
        phone: "+14155550102",
        email: "bob@example.com",
      }),
    );

    const created = await request(app)
      .post("/api/v1/contacts")
      .set(authHeader(alice.accessToken))
      .send({ identifier: "bob.example", customName: "Work Bob" });

    expect(created.status).toBe(201);
    expect(created.body.data.contact).toMatchObject({
      contactUser: { id: bob.user.id, displayName: "Bob Example" },
      customName: "Work Bob",
    });
    expect(created.body.data.contact.contactUser).not.toHaveProperty("email");

    const list = await request(app)
      .get("/api/v1/contacts")
      .set(authHeader(alice.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data.contacts).toHaveLength(1);
    expect(list.body.data.contacts[0].customName).toBe("Work Bob");
    expect(await ContactModel.countDocuments({ ownerId: alice.user.id })).toBe(
      1,
    );
    expect(await ContactModel.countDocuments({ ownerId: bob.user.id })).toBe(0);
  });

  it("prevents self, duplicate, and cross-owner contact operations", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.Example",
        name: "Bob Example",
        phone: "+14155550102",
        email: "bob@example.com",
      }),
    );
    const created = await request(app)
      .post("/api/v1/contacts")
      .set(authHeader(alice.accessToken))
      .send({ identifier: bob.user.phone });
    const duplicate = await request(app)
      .post("/api/v1/contacts")
      .set(authHeader(alice.accessToken))
      .send({ identifier: bob.user.username });
    const self = await request(app)
      .post("/api/v1/contacts")
      .set(authHeader(alice.accessToken))
      .send({ identifier: alice.user.username });
    const crossOwnerUpdate = await request(app)
      .patch(`/api/v1/contacts/${alice.user.id}`)
      .set(authHeader(bob.accessToken))
      .send({ customName: "Not allowed" });

    expect(created.status).toBe(201);
    expect(duplicate.body.error.code).toBe("CONTACT_ALREADY_EXISTS");
    expect(self.body.error.code).toBe("CANNOT_ADD_SELF");
    expect(crossOwnerUpdate.status).toBe(404);
  });
});
