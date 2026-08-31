import type { HydratedDocument } from "mongoose";

export type AccountStatus = "active" | "suspended" | "disabled";
export type UserRole = "user" | "moderator" | "admin";

export interface UserEntity {
  username: string;
  usernameNormalized: string;
  displayName: string;
  email: string | null;
  emailNormalized: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  passwordHash: string;
  avatarUrl: string | null;
  bio: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  accountStatus: AccountStatus;
  role: UserRole;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<UserEntity>;
