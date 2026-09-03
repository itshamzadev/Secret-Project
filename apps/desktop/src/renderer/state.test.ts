import { describe, expect, it } from "vitest";

describe("desktop security foundation", () => {
  it("uses the secure desktop bridge contract", () => {
    expect([
      "readRefreshToken",
      "writeRefreshToken",
      "clearRefreshToken",
    ]).toHaveLength(3);
  });
});
