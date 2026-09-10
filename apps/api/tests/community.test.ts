import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
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
  return request(app).post("/api/v1/auth/register").send(registerPayload(overrides));
}

describe("groups, channels, and status", () => {
  beforeAll(connectTestData);
  beforeEach(clearTestData);
  afterAll(disconnectTestData);

  it("creates and lists a group for its members", async () => {
    const alice = authData(await register());
    const bob = authData(await register({
      username: "Bob.Community",
      name: "Bob Community",
      phone: "+14155550102",
      email: "bob-community@example.com",
    }));
    await request(app)
      .post("/api/v1/contacts")
      .set(authHeader(alice.accessToken))
      .send({ identifier: bob.user.username });

    const created = await request(app)
      .post("/api/v1/groups")
      .set(authHeader(alice.accessToken))
      .send({ name: "Weekend Walkers", description: "Plans and check-ins", memberUserIds: [bob.user.id] });

    expect(created.status).toBe(201);
    expect(created.body.data.group).toMatchObject({
      name: "Weekend Walkers",
      memberCount: 2,
      members: expect.arrayContaining([
        expect.objectContaining({ id: bob.user.id }),
      ]),
    });

    const bobGroups = await request(app)
      .get("/api/v1/groups")
      .set(authHeader(bob.accessToken));
    expect(bobGroups.status).toBe(200);
    expect(bobGroups.body.data.groups).toHaveLength(1);
  });

  it("creates, follows, and publishes channel posts", async () => {
    const alice = authData(await register());
    const bob = authData(await register({
      username: "Bob.Channel",
      name: "Bob Channel",
      phone: "+14155550103",
      email: "bob-channel@example.com",
    }));
    const created = await request(app)
      .post("/api/v1/channels")
      .set(authHeader(alice.accessToken))
      .send({ name: "Daily Brief", handle: "daily_brief", description: "Short updates" });
    expect(created.status).toBe(201);
    const channelId = created.body.data.channel.id as string;

    const followed = await request(app)
      .post(`/api/v1/channels/${channelId}/follow`)
      .set(authHeader(bob.accessToken));
    expect(followed.status).toBe(200);
    expect(followed.body.data.channel.followerCount).toBe(2);

    const post = await request(app)
      .post(`/api/v1/channels/${channelId}/posts`)
      .set(authHeader(alice.accessToken))
      .send({ text: "The first community note." });
    expect(post.status).toBe(201);

    const posts = await request(app)
      .get(`/api/v1/channels/${channelId}/posts`)
      .set(authHeader(bob.accessToken));
    expect(posts.status).toBe(200);
    expect(posts.body.data.posts[0]).toMatchObject({ text: "The first community note." });
  });

  it("creates, views, and deletes a text status", async () => {
    const alice = authData(await register());
    const bob = authData(await register({
      username: "Bob.Status",
      name: "Bob Status",
      phone: "+14155550104",
      email: "bob-status@example.com",
    }));
    await request(app)
      .post("/api/v1/contacts")
      .set(authHeader(bob.accessToken))
      .send({ identifier: alice.user.username });

    const created = await request(app)
      .post("/api/v1/status")
      .set(authHeader(alice.accessToken))
      .send({ text: "A calm blue morning." });
    expect(created.status).toBe(201);
    const statusId = created.body.data.status.id as string;

    const list = await request(app)
      .get("/api/v1/status")
      .set(authHeader(bob.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data.statuses).toHaveLength(1);
    expect(list.body.data.statuses[0]).toMatchObject({ text: "A calm blue morning.", viewed: false });

    const viewed = await request(app)
      .post(`/api/v1/status/${statusId}/view`)
      .set(authHeader(bob.accessToken));
    expect(viewed.status).toBe(200);

    const aliceStatuses = await request(app)
      .get("/api/v1/status")
      .set(authHeader(alice.accessToken));
    expect(aliceStatuses.status).toBe(200);
    expect(aliceStatuses.body.data.statuses[0]).toMatchObject({
      viewerCount: 1,
      viewers: [expect.objectContaining({ id: bob.user.id })],
    });

    const deleted = await request(app)
      .delete(`/api/v1/status/${statusId}`)
      .set(authHeader(alice.accessToken));
    expect(deleted.status).toBe(200);
  });

  it("stores and serves an image status without exposing it to unrelated users", async () => {
    const alice = authData(await register());
    const bob = authData(await register({
      username: "Bob.MediaStatus",
      name: "Bob Media Status",
      phone: "+14155550105",
      email: "bob-media-status@example.com",
    }));
    await request(app)
      .post("/api/v1/contacts")
      .set(authHeader(bob.accessToken))
      .send({ identifier: alice.user.username });

    const image = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const created = await request(app)
      .post("/api/v1/status/media")
      .set(authHeader(alice.accessToken))
      .set("Content-Type", "image/png")
      .set("x-file-name", "status.png")
      .query({ type: "image", width: 1, height: 1 })
      .send(image);
    expect(created.status).toBe(201);
    expect(created.body.data.status).toMatchObject({
      type: "image",
      text: "",
      media: { mimeType: "image/png", width: 1, height: 1 },
    });

    const statusId = created.body.data.status.id as string;
    const listed = await request(app)
      .get("/api/v1/status")
      .set(authHeader(bob.accessToken));
    expect(listed.status).toBe(200);
    const mediaStatus = listed.body.data.statuses.find((status: { id: string }) => status.id === statusId);
    expect(mediaStatus).toMatchObject({ type: "image", media: { url: `/api/v1/status/${statusId}/media` } });

    const downloaded = await request(app)
      .get(`/api/v1/status/${statusId}/media`)
      .set(authHeader(bob.accessToken));
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers["content-type"]).toContain("image/png");
    expect(downloaded.body).toEqual(image);
  });
});
