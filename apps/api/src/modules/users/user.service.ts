import { Types } from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import { UserModel } from "./user.model.js";
import type { UserDocument } from "./user.types.js";

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string): string {
  const parsed = parsePhoneNumberFromString(phone.trim());
  if (parsed === undefined || !parsed.isValid()) {
    throw new Error("Invalid phone number");
  }

  return parsed.number;
}

function tryNormalizePhone(phone: string): string | null {
  try {
    return normalizePhone(phone);
  } catch {
    return null;
  }
}

export async function usernameExists(
  usernameNormalized: string,
): Promise<boolean> {
  return (await UserModel.exists({ usernameNormalized }).exec()) !== null;
}

export async function emailExists(emailNormalized: string): Promise<boolean> {
  return (await UserModel.exists({ emailNormalized }).exec()) !== null;
}

export async function phoneExists(phoneNormalized: string): Promise<boolean> {
  return (await UserModel.exists({ phoneNormalized }).exec()) !== null;
}

function loginIdentifiers(identifier: string): string[] {
  const normalized = identifier.trim().toLowerCase();
  const phone = tryNormalizePhone(identifier);
  return phone === null ? [normalized] : [normalized, phone];
}

export async function findUserForLogin(
  identifierNormalized: string,
): Promise<UserDocument | null> {
  return UserModel.findOne({
    $or: loginIdentifiers(identifierNormalized).flatMap((identifier) => [
      { emailNormalized: identifier },
      { usernameNormalized: identifier },
      { phoneNormalized: identifier },
    ]),
  })
    .select("+passwordHash")
    .exec();
}

export async function findUserByIdentifier(
  identifier: string,
): Promise<UserDocument | null> {
  return UserModel.findOne({
    $or: loginIdentifiers(identifier).flatMap((value) => [
      { emailNormalized: value },
      { usernameNormalized: value },
      { phoneNormalized: value },
    ]),
  }).exec();
}

export async function getUserById(
  userId: string,
): Promise<UserDocument | null> {
  if (!Types.ObjectId.isValid(userId)) {
    return null;
  }

  return UserModel.findById(userId).exec();
}
