import { describe, expect, it } from "vitest";

import {
  correlationIdHeader,
  createRequestContext,
  createServiceLogger,
  requestIdHeader,
} from "../src/index.js";

describe("request and correlation IDs", () => {
  it("preserves valid incoming IDs", () => {
    const context = createRequestContext({
      requestId: "request-123",
      correlationId: "correlation-456",
    });

    expect(context).toEqual({
      requestId: "request-123",
      correlationId: "correlation-456",
    });
  });

  it("uses the generated request ID as the correlation fallback", () => {
    const context = createRequestContext();

    expect(context.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(context.correlationId).toBe(context.requestId);
  });

  it("rejects unsafe or oversized incoming IDs", () => {
    const context = createRequestContext({
      requestId: "bad\r\nheader",
      correlationId: "x".repeat(129),
    });

    expect(context.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(context.correlationId).toBe(context.requestId);
  });

  it("keeps stable header names", () => {
    expect(requestIdHeader).toBe("X-Request-ID");
    expect(correlationIdHeader).toBe("X-Correlation-ID");
  });
});

describe("service logger", () => {
  it("creates a named child-capable logger", () => {
    const logger = createServiceLogger({ serviceName: "test-service" });
    const child = logger.child({ requestId: "request-123" });

    expect(typeof logger.info).toBe("function");
    expect(typeof child.info).toBe("function");
    logger.flush();
  });
});
