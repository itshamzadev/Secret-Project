import type { HydratedDocument, Types } from "mongoose";

export interface ContactEntity {
  ownerId: Types.ObjectId;
  contactUserId: Types.ObjectId;
  customName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ContactDocument = HydratedDocument<ContactEntity>;
