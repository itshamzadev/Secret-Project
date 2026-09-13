import type { BadgeType } from "@terqivo/contracts";
import type { HydratedDocument, Types } from "mongoose";

export interface GroupEntity {
  name: string;
  description: string;
  avatarUrl: string | null;
  avatarStorageKey: string | null;
  avatarMimeType: string | null;
  badges: BadgeType[];
  ownerId: Types.ObjectId;
  memberIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export type GroupDocument = HydratedDocument<GroupEntity>;
