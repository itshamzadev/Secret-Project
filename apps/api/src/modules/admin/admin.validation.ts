import { adminRoles, badgeTypes } from "@terqivo/contracts";
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

export const adminUserIdParamsSchema = z.object({
  userId: z
    .string()
    .trim()
    .regex(/^[a-f\d]{24}$/i, "userId must be a valid ObjectId"),
});

export const adminPasswordChangeSchema = z.object({
  password: z.string().min(8).max(1024),
});

export const adminUserStatusSchema = z.object({
  status: z.enum(["active", "suspended", "disabled"]),
});

export const adminUserTierSchema = z.object({
  userTier: z.enum(["normal", "special", "special_pro", "ultra_special"]),
});

export const adminBadgesSchema = z.object({
  badges: z
    .array(z.enum(badgeTypes))
    .max(badgeTypes.length)
    .refine((badges) => new Set(badges).size === badges.length, "Duplicate badges are not allowed."),
});

const adminTargetIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, "id must be a valid ObjectId");

export const adminGroupIdParamsSchema = z.object({ groupId: adminTargetIdSchema });
export const adminChannelIdParamsSchema = z.object({ channelId: adminTargetIdSchema });

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
