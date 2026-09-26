import { model, Schema, type HydratedDocument, type Types } from "mongoose";

export interface UserBlockEntity {
  blockerId: Types.ObjectId;
  blockedUserId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
export type UserBlockDocument = HydratedDocument<UserBlockEntity>;

const schema = new Schema<UserBlockEntity>({
  blockerId: { type: Schema.Types.ObjectId, required: true },
  blockedUserId: { type: Schema.Types.ObjectId, required: true },
}, { collection: "user_blocks", timestamps: true, versionKey: false });
schema.index({ blockerId: 1, blockedUserId: 1 }, { unique: true });
schema.index({ blockedUserId: 1 });

export const UserBlockModel = model<UserBlockEntity>("RelationshipUserBlock", schema, "user_blocks");
