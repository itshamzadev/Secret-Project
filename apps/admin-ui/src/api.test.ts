import { describe, expect, it } from "vitest";

import { buildAdminApiUrl } from "./api";

describe("admin API client", () => {
  it("keeps admin requests under the configured API version", () => {
    expect(buildAdminApiUrl("/admin/auth/me")).toMatch(
      /\/api\/v1\/admin\/auth\/me$/,
    );
  });
});
