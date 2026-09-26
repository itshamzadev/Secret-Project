import type { HydratedDocument, Types } from "mongoose";

export type AccountStatus = "active" | "suspended" | "disabled";
export type BadgeType = "verified" | "terqivo";

export interface UserEntity {
  _id: Types.ObjectId;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  accountStatus: AccountStatus;
  badges: BadgeType[];
}

export type UserDocument = HydratedDocument<UserEntity>;
