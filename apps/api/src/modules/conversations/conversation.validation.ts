import { z } from "zod";

import { objectIdSchema } from "../../utils/identifiers.js";

export const createDirectConversationSchema = z.object({
  userId: objectIdSchema,
});

export const conversationIdParamsSchema = z.object({
  conversationId: objectIdSchema,
});

export const conversationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).max(512).optional(),
});

export const conversationUnreadSchema = z.object({
  unread: z.boolean(),
});

export const conversationMuteSchema = z.object({
  duration: z.enum(["8h", "1w", "always"]),
});

export type CreateDirectConversationInput = z.infer<
  typeof createDirectConversationSchema
>;
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;
export type ConversationUnreadInput = z.infer<typeof conversationUnreadSchema>;
export type ConversationMuteInput = z.infer<typeof conversationMuteSchema>;
