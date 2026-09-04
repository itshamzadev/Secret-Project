import { describe, expect, it } from "vitest";

import { aiQuerySchema } from "../src/modules/ai/ai.validation.js";

describe("AI query validation", () => {
  it("requires a concise non-empty query", () => {
    expect(aiQuerySchema.safeParse({ query: "Explain React" }).success).toBe(
      true,
    );
    expect(aiQuerySchema.safeParse({ query: " " }).success).toBe(false);
    expect(aiQuerySchema.safeParse({ query: "x".repeat(4001) }).success).toBe(
      false,
    );
  });
});
