import { z } from "zod";

import { objectIdSchema } from "../../utils/identifiers.js";

export const presenceUserIdParamsSchema = z.object({
  userId: objectIdSchema,
});

export const presenceHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).max(512).optional(),
});

export type PresenceHistoryQuery = z.infer<typeof presenceHistoryQuerySchema>;
