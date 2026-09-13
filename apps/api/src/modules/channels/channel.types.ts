import type { BadgeType } from "@terqivo/contracts";
import type { HydratedDocument, Types } from "mongoose";

export interface ChannelEntity {
  name: string;
  handle: string;
  description: string;
  avatarUrl: string | null;
  avatarStorageKey: string | null;
  avatarMimeType: string | null;
  badges: BadgeType[];
  ownerId: Types.ObjectId;
  followerIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export type ChannelDocument = HydratedDocument<ChannelEntity>;

export interface ChannelPostEntity {
  channelId: Types.ObjectId;
  authorId: Types.ObjectId;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ChannelPostDocument = HydratedDocument<ChannelPostEntity>;
