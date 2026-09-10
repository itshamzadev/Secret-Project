import { reportReasons } from "@terqivo/contracts";
import { z } from "zod";

import { objectIdSchema } from "../../utils/identifiers.js";

export const createReportSchema = z.object({
  targetType: z.enum(["user", "message", "group", "channel"]),
  targetUserId: objectIdSchema.optional(),
  conversationId: objectIdSchema.optional(),
  messageId: objectIdSchema.optional(),
  groupId: objectIdSchema.optional(),
  channelId: objectIdSchema.optional(),
  reason: z.enum(reportReasons),
  details: z.string().trim().max(1000).optional(),
});

export const reportIdParamsSchema = z.object({
  reportId: objectIdSchema,
});

export const reportStatusSchema = z.object({
  status: z.enum(["resolved", "dismissed", "open"]),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ReportStatusInput = z.infer<typeof reportStatusSchema>;
