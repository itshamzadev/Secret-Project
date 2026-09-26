import { model, Schema, type HydratedDocument, type Types } from "mongoose";

export interface ContactEntity {
  ownerId: Types.ObjectId;
  contactUserId: Types.ObjectId;
  customName: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export type ContactDocument = HydratedDocument<ContactEntity>;

const schema = new Schema<ContactEntity>({
  ownerId: { type: Schema.Types.ObjectId, required: true },
  contactUserId: { type: Schema.Types.ObjectId, required: true },
  customName: { type: String, default: null, trim: true, maxlength: 100 },
}, { collection: "contacts", timestamps: true, versionKey: false });
schema.index({ ownerId: 1, contactUserId: 1 }, { unique: true });
schema.index({ ownerId: 1, createdAt: -1 });

export const ContactModel = model<ContactEntity>("RelationshipContact", schema, "contacts");
