import { describe, expect, it } from "vitest";

import { hasAdminPermission } from "../src/modules/admin/admin.service.js";
import {
  adminLoginSchema,
  adminUsersQuerySchema,
} from "../src/modules/admin/admin.validation.js";

describe("admin foundation", () => {
  it("grants a configured permission", () => {
    expect(
      hasAdminPermission(
        {
          adminId: "admin-id",
          role: "support",
          permissions: ["users.view"],
        },
        "users.view",
      ),
    ).toBe(true);
    expect(
      hasAdminPermission(
        {
          adminId: "admin-id",
          role: "support",
          permissions: ["users.view"],
        },
        "users.suspend",
      ),
    ).toBe(false);
  });

  it("allows super admins to use the permission boundary", () => {
    expect(
      hasAdminPermission(
        { adminId: "admin-id", role: "super_admin", permissions: [] },
        "dashboard.view",
      ),
    ).toBe(true);
  });

  it("validates admin login and user-list query inputs", () => {
    expect(
      adminLoginSchema.parse({
        email: " Admin@Example.com ",
        password: "long-password",
      }),
    ).toEqual({ email: "admin@example.com", password: "long-password" });
    expect(adminUsersQuerySchema.parse({ limit: "10" })).toEqual({ limit: 10 });
  });
});
