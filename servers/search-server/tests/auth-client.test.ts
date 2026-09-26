import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { jwtVerify } from "jose";
import { AuthServerClient } from "../src/clients/auth.client.js";

const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });

describe("Auth Server protocol client", () => {
  it("sends the user bearer token and an allowed search service token", async () => {
    let observedAuth = "";
    const server = createServer(async (request, response) => {
      if (request.url !== "/internal/auth/validate" || request.method !== "GET") { response.writeHead(404); response.end(); return; }
      observedAuth = request.headers.authorization ?? "";
      const internal = request.headers["x-internal-service-token"];
      expect(internal).toEqual(expect.any(String));
      const verified = await jwtVerify(internal as string, new TextEncoder().encode(process.env.INTERNAL_SERVICE_SECRET), { issuer: "terqivo-internal", audience: "terqivo-services", algorithms: ["HS256"] });
      expect(verified.payload.serviceName).toBe("search-server");
      response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ success: true, data: { userId: "user-a", sessionId: "session-a" } }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve())); servers.push(server);
    const address = server.address(); if (address === null || typeof address === "string") throw new Error("test server did not expose a port");
    const context = await new AuthServerClient(`http://127.0.0.1:${address.port}`).validateAccessToken("user-access-token");
    expect(observedAuth).toBe("Bearer user-access-token"); expect(context).toEqual({ userId: "user-a", sessionId: "session-a" });
  });
});
