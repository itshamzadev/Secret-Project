import { clientPlatforms } from "@terqivo/contracts";
import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const platformSchema = z.enum(clientPlatforms);

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[A-Za-z0-9_.]+$/, "username contains unsupported characters");

const deviceFields = {
  deviceId: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/)
    .optional(),
  deviceName: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(
      (value) =>
        [...value].every((character) => {
          const codePoint = character.charCodeAt(0);
          return codePoint >= 32 && codePoint !== 127;
        }),
      "deviceName contains unsupported control characters",
    )
    .optional(),
  platform: platformSchema.default("unknown"),
  appVersion: z.string().trim().min(1).max(32).nullable().optional(),
  appBuild: z.number().int().min(0).max(2_147_483_647).nullable().optional(),
};

const registerEmailSchema = z.string().trim().email().max(254).toLowerCase();
const registerPhoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(32)
  .regex(/^\+[0-9 ()-]+$/)
  .refine(
    (value) => parsePhoneNumberFromString(value)?.isValid() === true,
    "phone must be a valid international phone number",
  );

export const registerSchema = z.object({
  username: usernameSchema,
  name: z.string().trim().min(1).max(100),
  email: registerEmailSchema.optional(),
  phone: registerPhoneSchema.optional(),
  password: z.string().min(8).max(1024),
  ...deviceFields,
}).refine(
  (value) => value.email !== undefined || value.phone !== undefined,
  { message: "email or phone is required", path: ["email"] },
);

export const usernameExistsQuerySchema = z.object({
  username: usernameSchema,
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(8).max(1024),
  ...deviceFields,
});

export const refreshSchema = z.object({
  refreshToken: z.string().trim().min(1).max(512).optional(),
  appVersion: z.string().trim().min(1).max(32).nullable().optional(),
  appBuild: z.number().int().min(0).max(2_147_483_647).nullable().optional(),
});

export const sessionIdParamsSchema = z.object({
  sessionId: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
