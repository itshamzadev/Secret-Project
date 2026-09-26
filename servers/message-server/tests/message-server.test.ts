import request from "supertest";
import { describe, expect, it } from "vitest";

import { createMessageApp } from "../src/app.js";

const app = createMessageApp();

describe("message server transport", () => {
  it("exposes a non-sensitive health response", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { status: "ok", serviceName: "message-server" } });
    expect(JSON.stringify(response.body)).not.toContain("mongodb://");
  });

  it("keeps protected community APIs behind the existing user token contract", async () => {
    const response = await request(app).get("/api/v1/conversations");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("does not expose arbitrary routes or database query primitives", async () => {
    const response = await request(app).get("/api/v1/users/resolve?query=users");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
  });

  it("rejects admin mutation requests without the internal service credential", async () => {
    const response = await request(app).patch("/internal/admin/groups/507f1f77bcf86cd799439011/badges").send({ badges: ["verified"] });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INTERNAL_SERVICE_UNAUTHORIZED");
  });
});
