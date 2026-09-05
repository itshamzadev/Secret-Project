import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const adminIndex = readFileSync(
  resolve(process.cwd(), "../admin-ui/dist/index.html"),
  "utf8",
);

function assetPath(pattern: RegExp): string {
  const match = pattern.exec(adminIndex)?.[1];
  if (match === undefined) {
    throw new Error("Expected admin asset reference was not found");
  }
  return match;
}

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

  it("serves the admin SPA and its public assets", async () => {
    const root = await request(app).get("/admin").redirects(1);
    const page = await request(app).get("/admin/login");
    const css = await request(app).get(
      assetPath(/href="(\/admin\/assets\/[^"\\]+\.css)"/),
    );
    const javascript = await request(app).get(
      assetPath(/src="(\/admin\/assets\/[^"\\]+\.js)"/),
    );
    const missingAsset = await request(app).get(
      "/admin/assets/asset-that-does-not-exist.js",
    );

    expect(root.status).toBe(200);
    expect(root.type).toBe("text/html");
    expect(page.status).toBe(200);
    expect(page.type).toBe("text/html");
    expect(css.status).toBe(200);
    expect(css.type).toBe("text/css");
    expect(javascript.status).toBe(200);
    expect(javascript.type).toMatch(/javascript|ecmascript/);
    expect(missingAsset.status).toBe(404);
    expect(missingAsset.type).toBe("application/json");
    expect(css.body).not.toHaveProperty("error");
    expect(javascript.body).not.toHaveProperty("error");
  });

  it("keeps admin API routes protected independently of public assets", async () => {
    const response = await request(app).get("/api/v1/admin/dashboard");

    expect([401, 403]).toContain(response.status);
    expect(response.body.success).toBe(false);
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
