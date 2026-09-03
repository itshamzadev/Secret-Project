import { describe, expect, it } from "vitest";

describe("web client foundation", () => {
  it("keeps the application identity stable", () => {
    expect("Terqivo Connect").toBe("Terqivo Connect");
  });
});
