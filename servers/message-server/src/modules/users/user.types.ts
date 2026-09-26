import type { HydratedDocument } from "mongoose";
import type { BadgeType } from "../../contracts/index.js";

export type AccountStatus = "active" | "suspended" | "disabled";
export type AccountType = "personal" | "professional" | "business";
export type UserRole = "user" | "moderator" | "admin";
export type UserTier = "normal" | "special" | "special_pro" | "ultra_special";
export interface UserEntity {
  username: string; usernameNormalized: string; displayName: string;
  email: string | null; emailNormalized: string | null; phone: string | null; phoneNormalized: string | null;
  passwordHash: string; avatarUrl: string | null; avatarStorageKey: string | null; avatarMimeType: string | null;
  bio: string | null; emailVerified: boolean; phoneVerified: boolean; accountStatus: AccountStatus; role: UserRole;
  accountType: AccountType; userTier: UserTier; badges: BadgeType[]; lastSeenAt: Date | null; createdAt: Date; updatedAt: Date;
}
export type UserDocument = HydratedDocument<UserEntity>;
