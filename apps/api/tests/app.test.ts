import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

const app = createApp({
  getHealthSnapshot: () => ({
    status: "ok",
    database: "connected",
    redis: "connected",
    uptime: 12.34,
  }),
});

describe("API foundation", () => {
  it("trusts exactly one reverse-proxy hop for client IP resolution", () => {
    expect(app.get("trust proxy")).toBe(1);
  });

  it("returns the health status", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        status: "ok",
        database: "connected",
        redis: "connected",
        uptime: 12.34,
      },
    });
  });

  it("does not upgrade assets when the public origin is not HTTPS", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.headers["content-security-policy"]).not.toContain(
      "upgrade-insecure-requests",
    );
  });

  it("returns a consistent error for an unknown API route", async () => {
    const response = await request(app).get("/api/v1/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "The requested route was not found.",
      },
    });
  });
});
