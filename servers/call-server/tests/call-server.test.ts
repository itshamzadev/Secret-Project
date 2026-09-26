import request from "supertest";
import { describe, expect, it } from "vitest";

import { createCallApp } from "../src/app.js";

const app = createCallApp();

describe("Call Server operational and compatibility surface", () => {
  it("reports process health without dependency secrets", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { serviceName: "call-server-test", status: "ok" } });
    expect(JSON.stringify(response.body)).not.toContain("mongodb://");
  });

  it("reports dependency readiness separately from process health", async () => {
    const response = await request(app).get("/ready");
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("CALL_SERVER_NOT_READY");
    expect(JSON.stringify(response.body)).not.toContain("127.0.0.1");
  });

  it("keeps the public calls path authenticated", async () => {
    const response = await request(app).get("/api/v1/calls");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects realtime commands without the Realtime Hub service credential", async () => {
    const response = await request(app).post("/internal/realtime/calls/session-disconnected").send({ sessionId: "session" });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INTERNAL_SERVICE_UNAUTHORIZED");
  });
});
