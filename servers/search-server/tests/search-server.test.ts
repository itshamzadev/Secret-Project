import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { AppError } from "../src/core/errors.js";
import type { AuthClient } from "../src/clients/auth.client.js";
import { SearchService } from "../src/modules/search/search.service.js";
import type { WebSearchProvider } from "../src/modules/search/types.js";

const auth: AuthClient = { validateAccessToken: async (token) => { if (token !== "valid") throw new AppError({ code: "INVALID_ACCESS_TOKEN", message: "The access token is invalid or expired.", statusCode: 401 }); return { userId: "user-a", sessionId: "session-a" }; } };
const provider: WebSearchProvider = { name: "terqivo", search: async (query) => ({ results: [{ position: 1, title: query, url: "https://example.test/result", source: "Example" }] }) };

describe("search-server compatibility", () => {
  it("serves health and readiness without dependencies or secrets", async () => { const app = createApp({ authClient: auth, searchService: new SearchService(provider), readinessCheck: async () => true }); expect((await request(app).get("/health")).status).toBe(200); expect((await request(app).get("/ready")).status).toBe(200); });
  it("reports readiness failure without exposing the Auth URL", async () => { const app = createApp({ authClient: auth, searchService: new SearchService(provider), readinessCheck: async () => false }); const response = await request(app).get("/ready"); expect(response.status).toBe(503); expect(response.text).not.toContain("5101"); });
  it("requires a valid user bearer token and preserves search response contract", async () => { const app = createApp({ authClient: auth, searchService: new SearchService(provider) }); const response = await request(app).get("/api/v1/search/web?q=Terqivo&page=2").set("Authorization", "Bearer valid").set("X-Request-ID", "request-123").set("X-Correlation-ID", "correlation-123"); expect(response.status).toBe(200); expect(response.headers["x-request-id"]).toBe("request-123"); expect(response.headers["x-correlation-id"]).toBe("correlation-123"); expect(response.body).toMatchObject({ success: true, data: { query: "Terqivo", provider: "terqivo", page: 2, results: [{ title: "Terqivo" }] } }); expect((await request(app).get("/api/v1/search/web?q=Terqivo")).status).toBe(401); });
  it("returns safe validation and route errors", async () => { const app = createApp({ authClient: auth, searchService: new SearchService(provider) }); expect((await request(app).get("/api/v1/search/web?q=x").set("Authorization", "Bearer valid")).body.error.code).toBe("VALIDATION_ERROR"); expect((await request(app).get("/api/v1/messages")).status).toBe(404); });
  it("does not expose unsupported private/domain search APIs", async () => { const app = createApp({ authClient: auth, searchService: new SearchService(provider) }); for (const path of ["/api/v1/users/search", "/api/v1/conversations/search", "/api/v1/groups/search", "/api/v1/channels/search", "/api/v1/messages/search"]) expect((await request(app).get(path)).status).toBe(404); });
});
