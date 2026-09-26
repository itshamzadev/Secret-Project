import { z } from "zod";
import { aiModelIds } from "./types.js";
export const aiQuerySchema = z.object({ query: z.string().trim().min(2, "Enter at least two characters.").max(4000), modelId: z.enum(aiModelIds).optional(), requestId: z.string().trim().min(8).max(128).optional(), conversationId: z.string().trim().min(1).max(128).optional() });
export type AiQueryInput = z.infer<typeof aiQuerySchema>;
