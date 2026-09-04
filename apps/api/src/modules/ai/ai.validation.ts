import { z } from "zod";

export const aiQuerySchema = z.object({
  query: z.string().trim().min(2, "Enter at least two characters.").max(4_000),
});

export type AiQuery = z.infer<typeof aiQuerySchema>;
