import { z } from "zod";

import { adminRoles } from "./contracts.js";

const objectId = z.string().trim().regex(/^[a-f\d]{24}$/i);
export const adminLoginSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(8).max(1024) });
export const adminUsersQuerySchema = z.object({ cursor: z.string().trim().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).default(25), search: z.string().trim().min(1).max(100).optional(), status: z.enum(["active", "suspended", "disabled"]).optional(), role: z.enum(["user", "moderator", "admin"]).optional() });
export const userIdParamsSchema = z.object({ userId: objectId });
export const groupIdParamsSchema = z.object({ groupId: objectId });
export const channelIdParamsSchema = z.object({ channelId: objectId });
export const passwordSchema = z.object({ password: z.string().min(8).max(1024) });
export const userStatusSchema = z.object({ status: z.enum(["active", "suspended", "disabled"]) });
export const userTierSchema = z.object({ userTier: z.enum(["normal", "special", "special_pro", "ultra_special"]) });
export const badgesSchema = z.object({ badges: z.array(z.enum(["verified", "terqivo"])).max(2).refine((values) => new Set(values).size === values.length, "Duplicate badges are not allowed.") });
export const reportIdParamsSchema = z.object({ reportId: objectId });
export const reportStatusSchema = z.object({ status: z.enum(["resolved", "dismissed", "open"]) });
export const createReportSchema = z.object({ targetType: z.enum(["user", "message", "group", "channel"]), targetUserId: objectId.optional(), conversationId: objectId.optional(), messageId: objectId.optional(), groupId: objectId.optional(), channelId: objectId.optional(), reason: z.enum(["spam", "harassment", "abuse", "impersonation", "other"]), details: z.string().trim().max(1000).optional() });
export const reportListQuerySchema = z.object({ status: z.enum(["open", "resolved", "dismissed"]).optional() });
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ReportStatusInput = z.infer<typeof reportStatusSchema>;
void adminRoles;
