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

export type CreateDirectConversationInput = z.infer<
  typeof createDirectConversationSchema
>;
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;
