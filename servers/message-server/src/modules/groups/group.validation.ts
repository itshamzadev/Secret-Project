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

export const createGroupSchema = z.object({
  name: safeText(80, 1),
  description: safeText(500).default(""),
  memberUserIds: z.array(objectIdSchema).max(99).default([]),
});

export const groupIdParamsSchema = z.object({ groupId: objectIdSchema });
export const updateGroupSchema = z.object({
  name: safeText(80, 1),
  description: safeText(500).default(""),
  memberUserIds: z.array(objectIdSchema).max(99).default([]),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
