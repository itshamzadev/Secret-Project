import { messageReactionEmojis } from "@terqivo/contracts";
import { z } from "zod";

import { objectIdSchema } from "../../utils/identifiers.js";

export const messageTextSchema = z.object({
  clientMessageId: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/),
  type: z.literal("text").default("text"),
  text: z.string().trim().min(1).max(4000),
});

export const messageHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).max(512).optional(),
});

export const messageIdParamsSchema = z.object({
  messageId: objectIdSchema,
});

export const messageReadSchema = z.object({
  lastReadMessageId: objectIdSchema,
});

export const messageReactionSchema = z.object({
  emoji: z.enum(messageReactionEmojis),
});

export const conversationMessageParamsSchema = z.object({
  conversationId: objectIdSchema,
});

export const typingSchema = z.object({
  conversationId: objectIdSchema,
});

export const socketMessageSendSchema = z.object({
  conversationId: objectIdSchema,
  clientMessageId: messageTextSchema.shape.clientMessageId,
  type: z.literal("text").default("text"),
  text: messageTextSchema.shape.text,
});

export const socketDeliveredSchema = z.object({
  messageId: objectIdSchema,
});

export const socketReadSchema = z.object({
  conversationId: objectIdSchema,
  lastReadMessageId: objectIdSchema,
});

export type MessageTextInput = z.infer<typeof messageTextSchema>;
export type MessageHistoryQuery = z.infer<typeof messageHistoryQuerySchema>;
export type MessageReadInput = z.infer<typeof messageReadSchema>;
export type MessageReactionInput = z.infer<typeof messageReactionSchema>;
export type SocketMessageSendInput = z.infer<typeof socketMessageSendSchema>;
