import type { HydratedDocument, Types } from "mongoose";

export interface GroupEntity {
  name: string;
  description: string;
  ownerId: Types.ObjectId;
  memberIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export type GroupDocument = HydratedDocument<GroupEntity>;
