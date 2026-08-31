import argon2 from "argon2";

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$YJ5cYMGIjbvI2aW15hnzlQ$3DmlwtIF3Ee/Jx0r7UJwHVROMLF4oRMpEQbZgyOcuXg";

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}

export async function verifyPasswordAgainstUserOrDummy(
  password: string,
  passwordHash: string | null,
): Promise<boolean> {
  return verifyPassword(password, passwordHash ?? DUMMY_PASSWORD_HASH);
}
