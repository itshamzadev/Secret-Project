import { z } from "zod";

import { objectIdSchema } from "../../utils/identifiers.js";

const safeText = z
  .string()
  .trim()
  .max(100)
  .refine(
    (value) => [...value].every((character) => character.charCodeAt(0) >= 32),
    "text contains unsupported control characters",
  );

export const contactIdentifierSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  customName: safeText.optional(),
});

export const contactUpdateSchema = z.object({
  customName: safeText.nullable(),
});

export const contactUserIdParamsSchema = z.object({
  contactUserId: objectIdSchema,
});

export const contactListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).max(512).optional(),
});

export type AddContactInput = z.infer<typeof contactIdentifierSchema>;
export type UpdateContactInput = z.infer<typeof contactUpdateSchema>;
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;
