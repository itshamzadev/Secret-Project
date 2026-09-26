import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import type { AuthDirectoryClient, PublicUser } from "../../clients/auth-directory.js";
import { ContactModel } from "../../models/contact.model.js";
import { UserBlockModel } from "../../models/block.model.js";

export interface ContactDto {
  id: string;
  contactUser: Omit<PublicUser, "accountStatus">;
  customName: string | null;
  createdAt: string;
  updatedAt: string;
}

const contactNotFound = () => new AppError({ code: "CONTACT_NOT_FOUND", message: "The contact was not found.", statusCode: 404 });
const interactionBlocked = () => new AppError({ code: "INTERACTION_BLOCKED", message: "This interaction is unavailable.", statusCode: 403 });
const objectId = (id: string): Types.ObjectId => new Types.ObjectId(id);

function publicContactUser(user: PublicUser): Omit<PublicUser, "accountStatus"> {
  const { accountStatus: _accountStatus, ...safe } = user;
  return safe;
}

function toContactDto(contact: { _id: Types.ObjectId; contactUserId: Types.ObjectId; customName: string | null; createdAt: Date; updatedAt: Date }, user: PublicUser): ContactDto {
  return { id: contact._id.toString(), contactUser: publicContactUser(user), customName: contact.customName, createdAt: contact.createdAt.toISOString(), updatedAt: contact.updatedAt.toISOString() };
}

export class RelationshipService {
  public constructor(private readonly auth: AuthDirectoryClient) {}

  public async addContact(ownerId: string, identifier: string, customName?: string): Promise<ContactDto> {
    const user = await this.auth.resolveIdentifier(identifier);
    if (user === null || user.accountStatus !== "active") throw contactNotFound();
    if (user.id === ownerId) throw new AppError({ code: "CANNOT_ADD_SELF", message: "You cannot add yourself as a contact.", statusCode: 400 });
    try {
      const contact = await ContactModel.create({ ownerId: objectId(ownerId), contactUserId: objectId(user.id), customName: customName ?? null });
      return toContactDto(contact, user);
    } catch (error) {
      if (isDuplicate(error)) throw new AppError({ code: "CONTACT_ALREADY_EXISTS", message: "That user is already in your contacts.", statusCode: 409 });
      throw error;
    }
  }

  public async updateContact(ownerId: string, contactUserId: string, customName: string | null): Promise<ContactDto> {
    const contact = await ContactModel.findOneAndUpdate({ ownerId: objectId(ownerId), contactUserId: objectId(contactUserId) }, { $set: { customName } }, { returnDocument: "after" }).exec();
    if (contact === null) throw contactNotFound();
    const [user] = await this.auth.batchPublicUsers([contactUserId]);
    if (user === undefined) throw contactNotFound();
    return toContactDto(contact, user);
  }

  public async removeContact(ownerId: string, contactUserId: string): Promise<void> {
    const result = await ContactModel.deleteOne({ ownerId: objectId(ownerId), contactUserId: objectId(contactUserId) }).exec();
    if (result.deletedCount === 0) throw contactNotFound();
  }

  public async listContacts(ownerId: string, query: { search?: string | undefined; limit: number; cursor?: string | undefined }): Promise<{ contacts: ContactDto[]; nextCursor: string | null }> {
    const filter: Record<string, unknown> = { ownerId: objectId(ownerId) };
    if (query.search !== undefined && query.search.length > 0) {
      const users = await this.auth.searchUsers(query.search);
      filter.contactUserId = { $in: users.map((user) => objectId(user.id)) };
    }
    const cursor = decodeCursor(query.cursor);
    if (cursor !== null) {
      const date = new Date(cursor.createdAt);
      if (Number.isNaN(date.getTime()) || !Types.ObjectId.isValid(cursor.id)) throw new AppError({ code: "INVALID_CURSOR", message: "The pagination cursor is invalid.", statusCode: 400 });
      filter.$or = [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: objectId(cursor.id) } }];
    }
    const docs = await ContactModel.find(filter).sort({ createdAt: -1, _id: -1 }).limit(query.limit + 1).exec();
    const hasNext = docs.length > query.limit;
    const page = hasNext ? docs.slice(0, query.limit) : docs;
    const users = await this.auth.batchPublicUsers(page.map((doc) => doc.contactUserId.toString()));
    const byId = new Map(users.map((user) => [user.id, user]));
    const contacts = page.flatMap((doc) => { const user = byId.get(doc.contactUserId.toString()); return user === undefined ? [] : [toContactDto(doc, user)]; });
    const last = page.at(-1);
    return { contacts, nextCursor: hasNext && last !== undefined ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last._id.toString() }) : null };
  }

  public async blockUser(ownerId: string, blockedUserId: string): Promise<void> {
    if (ownerId === blockedUserId) throw new AppError({ code: "CANNOT_BLOCK_SELF", message: "You cannot block yourself.", statusCode: 400 });
    const [user] = await this.auth.batchPublicUsers([blockedUserId]);
    if (user === undefined || user.accountStatus !== "active") throw interactionBlocked();
    try { await UserBlockModel.create({ blockerId: objectId(ownerId), blockedUserId: objectId(blockedUserId) }); }
    catch (error) { if (!isDuplicate(error)) throw error; }
  }

  public async unblockUser(ownerId: string, blockedUserId: string): Promise<boolean> {
    const result = await UserBlockModel.deleteOne({ blockerId: objectId(ownerId), blockedUserId: objectId(blockedUserId) }).exec();
    return result.deletedCount > 0;
  }

  public async check(firstUserId: string, secondUserId: string): Promise<{ blocked: boolean; areContacts: boolean }> {
    const [blocked, areContacts] = await Promise.all([
      UserBlockModel.exists({ $or: [{ blockerId: firstUserId, blockedUserId: secondUserId }, { blockerId: secondUserId, blockedUserId: firstUserId }] }),
      ContactModel.exists({ ownerId: firstUserId, contactUserId: secondUserId }),
    ]);
    return { blocked: blocked !== null, areContacts: areContacts !== null };
  }

  public async statusVisibility(viewerId: string, ownerIds: string[]): Promise<Array<{ ownerId: string; blocked: boolean; areContacts: boolean }>> {
    const visibility = await Promise.all(ownerIds.map(async (ownerId) => ({ ownerId, ...(ownerId === viewerId ? { blocked: false, areContacts: true } : await this.check(viewerId, ownerId)) })));
    return visibility;
  }

  public async assertCanInteract(firstUserId: string, secondUserId: string): Promise<void> {
    if ((await this.check(firstUserId, secondUserId)).blocked) throw interactionBlocked();
  }

  public async contactRelations(ownerId: string, contactUserIds: string[]): Promise<Array<{ contactUserId: string; customName: string | null }>> {
    const docs = await ContactModel.find({ ownerId: objectId(ownerId), contactUserId: { $in: contactUserIds.map(objectId) } }).select({ contactUserId: 1, customName: 1 }).lean().exec();
    return docs.map((doc) => ({ contactUserId: doc.contactUserId.toString(), customName: doc.customName }));
  }
}

function isDuplicate(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

function encodeCursor(value: { createdAt: string; id: string }): string { return Buffer.from(JSON.stringify(value), "utf8").toString("base64url"); }
function decodeCursor(value: string | undefined): { createdAt: string; id: string } | null {
  if (value === undefined) return null;
  try { const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); if (typeof parsed === "object" && parsed !== null && "createdAt" in parsed && "id" in parsed && typeof parsed.createdAt === "string" && typeof parsed.id === "string") return { createdAt: parsed.createdAt, id: parsed.id }; } catch { /* validated by caller */ }
  throw new AppError({ code: "INVALID_CURSOR", message: "The pagination cursor is invalid.", statusCode: 400 });
}
