import {
  e2efeProtocolVersions,
  messageReactionEmojis,
} from "@terqivo/contracts";
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
  e2efeDeviceId: z.coerce.number().int().min(1).max(127).optional(),
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

export const messageEditSchema = z.object({
  text: z.string().trim().min(1).max(4000),
});

export const messagePinSchema = z.object({
  scope: z.enum(["me", "everyone"]),
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

const e2efeBase64Schema = z
  .string()
  .trim()
  .min(4)
  .max(2_000_000)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "must be base64 encoded");

const e2efeEnvelopeSchema = z.object({
  recipientUserId: objectIdSchema,
  recipientDeviceId: z.number().int().min(1).max(127),
  envelopeType: z.union([z.literal(2), z.literal(3)]),
  ciphertext: e2efeBase64Schema,
});

const e2efeRevisionSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const e2efeEncryptedMessageSchema = z
  .object({
    conversationId: conversationMessageParamsSchema.shape.conversationId,
    clientMessageId: messageTextSchema.shape.clientMessageId,
    type: z.literal("text"),
    e2efeVersion: z.enum(e2efeProtocolVersions),
    senderDeviceId: z.number().int().min(1).max(127),
    envelopes: z.array(e2efeEnvelopeSchema).min(1).max(128),
  })
  .superRefine((input, context) => {
    const destinations = new Set<string>();
    for (const envelope of input.envelopes) {
      const key = `${envelope.recipientUserId}:${envelope.recipientDeviceId}`;
      if (destinations.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["envelopes"],
          message: "Duplicate E2EFE recipient device.",
        });
      }
      destinations.add(key);
    }
  });

export const e2efeEncryptedMessageEditSchema = z
  .object({
    messageId: conversationMessageParamsSchema.shape.conversationId,
    revisionId: e2efeRevisionSchema,
    e2efeVersion: z.enum(e2efeProtocolVersions),
    senderDeviceId: z.number().int().min(1).max(127),
    envelopes: z.array(e2efeEnvelopeSchema).min(1).max(128),
  })
  .superRefine((input, context) => {
    const destinations = new Set<string>();
    for (const envelope of input.envelopes) {
      const key = `${envelope.recipientUserId}:${envelope.recipientDeviceId}`;
      if (destinations.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["envelopes"],
          message: "Duplicate E2EFE recipient device.",
        });
      }
      destinations.add(key);
    }
  });

export const e2efeEncryptedMediaSchema = z
  .object({
    conversationId: conversationMessageParamsSchema.shape.conversationId,
    clientMessageId: messageTextSchema.shape.clientMessageId,
    type: z.enum(["image", "video", "audio", "file"]),
    e2efeVersion: z.enum(e2efeProtocolVersions),
    senderDeviceId: z.number().int().min(1).max(127),
    media: z.object({
      storageKey: z
        .string()
        .min(1)
        .max(160)
        .regex(/^[a-f0-9-]+\.bin$/i),
      size: z
        .number()
        .int()
        .min(1)
        .max(50 * 1024 * 1024),
    }),
    envelopes: z.array(e2efeEnvelopeSchema).min(1).max(128),
  })
  .superRefine((input, context) => {
    const destinations = new Set<string>();
    for (const envelope of input.envelopes) {
      const key = `${envelope.recipientUserId}:${envelope.recipientDeviceId}`;
      if (destinations.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["envelopes"],
          message: "Duplicate E2EFE recipient device.",
        });
      }
      destinations.add(key);
    }
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
export type E2EFEEncryptedMessageInput = z.infer<
  typeof e2efeEncryptedMessageSchema
>;
export type E2EFEEncryptedMessageEditInput = z.infer<
  typeof e2efeEncryptedMessageEditSchema
>;
export type E2EFEEncryptedMediaInput = z.infer<
  typeof e2efeEncryptedMediaSchema
>;
