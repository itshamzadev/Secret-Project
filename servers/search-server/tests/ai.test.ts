import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { AppError } from "../src/core/errors.js";
import type { AuthClient } from "../src/clients/auth.client.js";
import { AiOrchestrator } from "../src/modules/ai/ai.service.js";
import type { AiProvider } from "../src/modules/ai/types.js";

const auth: AuthClient = { validateAccessToken: async () => ({ userId: "user-ai", sessionId: "session-ai" }) };
const provider: AiProvider = { generate: async (input) => ({ answer: `answer:${input.query}`, providerModel: "test-model", grounded: input.googleSearch === true, sources: input.googleSearch === true ? [{ url: "https://example.test/source", title: "Source" }] : [] }), stream: async function* (input) { yield `answer:${input.query}`; } };

describe("AI compatibility", () => {
  it("keeps model options, local deterministic replies, and idempotency", async () => { const orchestrator = new AiOrchestrator({ geminiProvider: provider }); const app = createApp({ authClient: auth, aiOrchestrator: orchestrator }); expect((await request(app).get("/api/v1/ai/models").set("Authorization", "Bearer token")).body.data.models).toHaveLength(3); const first = await request(app).post("/api/v1/ai/query").set("Authorization", "Bearer token").send({ query: "hello", requestId: "request-ai-1" }); const second = await request(app).post("/api/v1/ai/query").set("Authorization", "Bearer token").send({ query: "hello", requestId: "request-ai-1" }); expect(first.body.data.route).toBe("local"); expect(second.body.data.answer).toBe(first.body.data.answer); });
  it("supports explicit web routing and streaming SSE", async () => { const orchestrator = new AiOrchestrator({ geminiProvider: provider }); const app = createApp({ authClient: auth, aiOrchestrator: orchestrator }); const response = await request(app).post("/api/v1/ai/query").set("Authorization", "Bearer token").send({ query: "search the web for Terqivo", modelId: "terqivo-ai" }); expect(response.body.data.grounded).toBe(true); expect(response.body.data.sources[0].url).toBe("https://example.test/source"); const stream = await request(app).post("/api/v1/ai/query/stream").set("Authorization", "Bearer token").send({ query: "hello" }); expect(stream.status).toBe(200); expect(stream.headers["content-type"]).toContain("text/event-stream"); expect(stream.text).toContain('"type":"complete"'); });
  it("returns not configured instead of falling back to another data source", async () => { const app = createApp({ authClient: auth, aiOrchestrator: new AiOrchestrator({ geminiProvider: null }) }); const response = await request(app).post("/api/v1/ai/query").set("Authorization", "Bearer token").send({ query: "a question requiring Gemini" }); expect(response.status).toBe(503); expect(response.body.error.code).toBe("AI_NOT_CONFIGURED"); });
  it("rejects an unavailable identity service safely", async () => { const failing: AuthClient = { validateAccessToken: async () => { throw new AppError({ code: "AUTH_SERVICE_UNAVAILABLE", message: "The identity service is unavailable.", statusCode: 503 }); } }; const app = createApp({ authClient: failing, aiOrchestrator: new AiOrchestrator({ geminiProvider: provider }) }); expect((await request(app).get("/api/v1/ai/models").set("Authorization", "Bearer token")).status).toBe(503); });
});
