import { z } from "zod";

import { objectIdSchema } from "../../utils/identifiers.js";

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) => [...value].every((character) => character.charCodeAt(0) >= 32),
      "text contains unsupported control characters",
    );

export const createGroupSchema = z.object({
  name: safeText(80).min(1),
  description: safeText(500).default(""),
  memberUserIds: z.array(objectIdSchema).max(99).default([]),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
