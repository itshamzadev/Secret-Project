import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { listAdminReports } from "../src/modules/reports/report.service.js";
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

describe("community management, privacy, and reports", () => {
  beforeAll(connectTestData);
  beforeEach(clearTestData);
  afterAll(disconnectTestData);

  it("persists a report with the authenticated reporter and target", async () => {
    const alice = authData(await register());
    const bob = authData(
      await register({
        username: "Bob.Report",
        name: "Bob Report",
        phone: "+14155550102",
        email: "bob-report@example.com",
      }),
    );
    const conversation = await request(app)
      .post("/api/v1/conversations/direct")
      .set(authHeader(bob.accessToken))
      .send({ userId: alice.user.id });
    const report = await request(app)
      .post("/api/v1/reports")
      .set(authHeader(bob.accessToken))
      .send({
        targetType: "user",
        targetUserId: alice.user.id,
        conversationId: conversation.body.data.conversation.id,
        reason: "harassment",
      });

    expect(report.status).toBe(201);
    expect(report.body.data.report).toMatchObject({
      targetType: "user",
      reason: "harassment",
      status: "open",
    });
    const adminView = await listAdminReports("open");
    expect(adminView.reports[0]).toMatchObject({
      reporter: { username: "Bob.Report" },
      targetUser: { username: "Alice.Example" },
    });
  });

  it("persists privacy settings per account", async () => {
    const alice = authData(await register());
    const defaults = await request(app)
      .get("/api/v1/users/me/privacy")
      .set(authHeader(alice.accessToken));
    const updated = await request(app)
      .patch("/api/v1/users/me/privacy")
      .set(authHeader(alice.accessToken))
      .send({
        profilePhoto: "nobody",
        lastSeen: "nobody",
        readReceipts: false,
        messageRequests: "contacts",
      });

    expect(defaults.status).toBe(200);
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      profilePhoto: "nobody",
      lastSeen: "nobody",
      readReceipts: false,
      messageRequests: "contacts",
    });
  });

  it("allows owners to update and delete their group and channel", async () => {
    const alice = authData(await register());
    const group = await request(app)
      .post("/api/v1/groups")
      .set(authHeader(alice.accessToken))
      .send({ name: "Original", description: "", memberUserIds: [] });
    const updatedGroup = await request(app)
      .patch(`/api/v1/groups/${group.body.data.group.id}`)
      .set(authHeader(alice.accessToken))
      .send({ name: "Updated", description: "New", memberUserIds: [] });
    const channel = await request(app)
      .post("/api/v1/channels")
      .set(authHeader(alice.accessToken))
      .send({
        name: "Original channel",
        handle: "original_channel",
        description: "",
      });
    const updatedChannel = await request(app)
      .patch(`/api/v1/channels/${channel.body.data.channel.id}`)
      .set(authHeader(alice.accessToken))
      .send({ name: "Updated channel", description: "New" });

    expect(updatedGroup.status).toBe(200);
    expect(updatedGroup.body.data.group.name).toBe("Updated");
    expect(updatedChannel.status).toBe(200);
    expect(updatedChannel.body.data.channel.name).toBe("Updated channel");
    expect(
      (
        await request(app)
          .delete(`/api/v1/groups/${group.body.data.group.id}`)
          .set(authHeader(alice.accessToken))
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .delete(`/api/v1/channels/${channel.body.data.channel.id}`)
          .set(authHeader(alice.accessToken))
      ).status,
    ).toBe(200);
  });
});
