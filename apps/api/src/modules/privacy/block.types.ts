import type { HydratedDocument, Types } from "mongoose";

export interface UserBlockEntity {
  blockerId: Types.ObjectId;
  blockedUserId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type UserBlockDocument = HydratedDocument<UserBlockEntity>;
