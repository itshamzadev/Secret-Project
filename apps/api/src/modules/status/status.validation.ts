import { z } from "zod";

import { objectIdSchema } from "../../utils/identifiers.js";

export const createStatusSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine(
      (value) => [...value].every((character) => character.charCodeAt(0) >= 32),
      "text contains unsupported control characters",
    ),
});

export const statusIdParamsSchema = z.object({ statusId: objectIdSchema });
export type CreateStatusInput = z.infer<typeof createStatusSchema>;
