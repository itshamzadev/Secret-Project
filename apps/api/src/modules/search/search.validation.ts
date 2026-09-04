import { z } from "zod";

export const webSearchQuerySchema = z.object({
  q: z.string().trim().min(2, "Enter at least two characters.").max(300),
});

export type WebSearchQuery = z.infer<typeof webSearchQuerySchema>;
