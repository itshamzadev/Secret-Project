import { describe, expect, it } from "vitest";

import {
  createChannelPostSchema,
  createChannelSchema,
} from "../src/modules/channels/channel.validation.js";
import { createGroupSchema } from "../src/modules/groups/group.validation.js";

describe("community text validation", () => {
  it("trims valid group names and rejects blank or oversized names", () => {
    expect(
      createGroupSchema.parse({ name: "  Weekend Walkers  " }),
    ).toMatchObject({ name: "Weekend Walkers" });
    expect(createGroupSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createGroupSchema.safeParse({ name: "x".repeat(81) }).success).toBe(
      false,
    );
  });

  it("applies the same safe minimum to channel names and posts", () => {
    expect(
      createChannelSchema.safeParse({ name: "   ", handle: "daily_brief" })
        .success,
    ).toBe(false);
    expect(createChannelPostSchema.safeParse({ text: "   " }).success).toBe(
      false,
    );
    expect(
      createChannelPostSchema.parse({ text: "  A useful update  " }),
    ).toEqual({ text: "A useful update" });
  });
});
