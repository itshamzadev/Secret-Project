import { z } from "zod";

import { objectIdSchema } from "../../utils/identifiers.js";

const statusTextSchema = (min = 0) =>
  z
    .string()
    .trim()
    .min(min)
    .max(500)
    .refine(
      (value) => [...value].every((character) => character.charCodeAt(0) >= 32),
      "text contains unsupported control characters",
    );

export const createStatusSchema = z.object({ text: statusTextSchema(1) });

export const statusMediaUploadQuerySchema = z.object({
  type: z.enum(["image", "video", "audio"]),
  text: statusTextSchema().default(""),
  width: z.coerce.number().int().min(1).max(20_000).optional(),
  height: z.coerce.number().int().min(1).max(20_000).optional(),
  durationSeconds: z.coerce.number().min(0).max(86_400).optional(),
});

export const statusIdParamsSchema = z.object({ statusId: objectIdSchema });
export type CreateStatusInput = z.infer<typeof createStatusSchema>;
export type StatusMediaUploadInput = z.infer<typeof statusMediaUploadQuerySchema>;
