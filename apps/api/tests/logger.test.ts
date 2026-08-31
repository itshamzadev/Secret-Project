import { Writable } from "node:stream";

import pino from "pino";
import { describe, expect, it } from "vitest";

import { logRedaction } from "../src/lib/logger.js";

describe("logger redaction", () => {
  it("redacts headers and nested credential fields", () => {
    let output = "";
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const testLogger = pino({ redact: logRedaction }, stream);

    testLogger.info(
      {
        req: {
          method: "GET",
          url: "/api/v1/health",
          headers: {
            authorization: "Bearer authorization-secret",
            cookie: "session=secret-cookie",
          },
        },
        res: {
          headers: {
            "set-cookie": ["refresh=secret-response-cookie"],
          },
        },
        password: "top-level-password",
        token: "top-level-token",
        body: {
          accessToken: "nested-access-token",
          refresh_token: "nested-refresh-token",
        },
        context: {
          auth: {
            refreshToken: "deep-refresh-token",
          },
        },
        signaling: {
          sdp: "secret-sdp",
          candidate: "secret-ice-candidate",
          credential: "secret-turn-credential",
        },
        statusCode: 200,
        responseTime: 3.14,
        remoteAddress: "127.0.0.1",
      },
      "redaction test",
    );

    expect(output).toContain('"authorization":"[REDACTED]"');
    expect(output).toContain('"cookie":"[REDACTED]"');
    expect(output).toContain('"set-cookie":"[REDACTED]"');
    expect(output).not.toContain("authorization-secret");
    expect(output).not.toContain("secret-cookie");
    expect(output).not.toContain("secret-response-cookie");
    expect(output).not.toContain("top-level-password");
    expect(output).not.toContain("top-level-token");
    expect(output).not.toContain("nested-access-token");
    expect(output).not.toContain("nested-refresh-token");
    expect(output).not.toContain("deep-refresh-token");
    expect(output).not.toContain("secret-sdp");
    expect(output).not.toContain("secret-ice-candidate");
    expect(output).not.toContain("secret-turn-credential");
    expect(output).toContain('"method":"GET"');
    expect(output).toContain('"url":"/api/v1/health"');
    expect(output).toContain('"statusCode":200');
  });
});
