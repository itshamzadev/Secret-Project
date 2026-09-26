import { z } from "zod";

import { objectIdSchema } from "../../utils/identifiers.js";

const safeText = (max: number, min = 0) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (value) => [...value].every((character) => character.charCodeAt(0) >= 32),
      "text contains unsupported control characters",
    );

export const createChannelSchema = z.object({
  name: safeText(80, 1),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,30}$/),
  description: safeText(500).default(""),
});

export const channelIdParamsSchema = z.object({ channelId: objectIdSchema });
export const updateChannelSchema = z.object({
  name: safeText(80, 1),
  description: safeText(500).default(""),
});
export const createChannelPostSchema = z.object({ text: safeText(4000, 1) });

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type CreateChannelPostInput = z.infer<typeof createChannelPostSchema>;
