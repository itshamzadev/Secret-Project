import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[A-Za-z0-9_.]+$/, "username contains unsupported characters");

const emailSchema = z.string().trim().email().max(254).toLowerCase();
const phoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(32)
  .regex(/^\+[0-9 ()-]+$/)
  .refine(
    (value) => parsePhoneNumberFromString(value)?.isValid() === true,
    "phone must be a valid international phone number",
  );

export const updateUserProfileSchema = z
  .object({
    username: usernameSchema.optional(),
    displayName: z.string().trim().min(1).max(100).optional(),
    bio: z.string().trim().max(500).nullable().optional(),
    email: emailSchema.nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    accountType: z.enum(["personal", "professional", "business"]).optional(),
  })
  .refine(
    (value) =>
      value.username !== undefined ||
      value.displayName !== undefined ||
      value.bio !== undefined ||
      value.email !== undefined ||
      value.phone !== undefined ||
      value.accountType !== undefined,
    "At least one profile field is required",
  );

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
