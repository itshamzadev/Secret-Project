import { adminRoles } from "@terqivo/contracts";
import { z } from "zod";

export const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(1024),
});

export const adminUsersQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["active", "suspended", "disabled"]).optional(),
  role: z.enum(["user", "moderator", "admin"]).optional(),
});

export const adminBootstrapRoleSchema = z.enum(adminRoles);

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
