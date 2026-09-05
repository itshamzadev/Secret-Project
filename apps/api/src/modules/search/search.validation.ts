import { z } from "zod";

export const webSearchQuerySchema = z.object({
  q: z.string().trim().min(2, "Enter at least two characters.").max(300),
  page: z.coerce.number().int().min(1).max(20).default(1),
});

export type WebSearchQuery = z.infer<typeof webSearchQuerySchema>;
