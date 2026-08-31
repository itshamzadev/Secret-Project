import type { ContactDto } from "@terqivo/contracts";
import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import { decodeCursor, encodeCursor } from "../../utils/cursors.js";
import {
  getMongoDuplicateFields,
  isMongoDuplicateKeyError,
} from "../../utils/mongo.js";
import { UserModel } from "../users/user.model.js";
import { findUserByIdentifier, getUserById } from "../users/user.service.js";
import type { AuthContext } from "../auth/auth.types.js";
import { ContactModel } from "./contact.model.js";
import { toContactDto } from "./contact.dto.js";
import type {
  AddContactInput,
  ContactListQuery,
  UpdateContactInput,
} from "./contact.validation.js";

function contactNotFound(): AppError {
  return new AppError({
    code: "CONTACT_NOT_FOUND",
    message: "The contact was not found.",
    statusCode: 404,
  });
}

function ownerObjectId(context: AuthContext): Types.ObjectId {
  return new Types.ObjectId(context.userId);
}

function duplicateContactError(error: unknown): AppError | null {
  if (!isMongoDuplicateKeyError(error)) {
    return null;
  }

  if (getMongoDuplicateFields(error).some((field) => field === "ownerId")) {
    return new AppError({
      code: "CONTACT_ALREADY_EXISTS",
      message: "That user is already in your contacts.",
      statusCode: 409,
    });
  }

  return null;
}

export async function addContact(
  context: AuthContext,
  input: AddContactInput,
): Promise<ContactDto> {
  const ownerId = ownerObjectId(context);
  const targetUser = await findUserByIdentifier(input.identifier);

  if (targetUser === null) {
    throw contactNotFound();
  }

  if (targetUser._id.equals(ownerId)) {
    throw new AppError({
      code: "CANNOT_ADD_SELF",
      message: "You cannot add yourself as a contact.",
      statusCode: 400,
    });
  }

  if (targetUser.accountStatus !== "active") {
    throw contactNotFound();
  }

  try {
    const contact = await ContactModel.create({
      ownerId,
      contactUserId: targetUser._id,
      customName: input.customName ?? null,
    });
    return toContactDto(contact, targetUser);
  } catch (error) {
    const duplicateError = duplicateContactError(error);
    if (duplicateError !== null) {
      throw duplicateError;
    }
    throw error;
  }
}

export async function updateContact(
  context: AuthContext,
  contactUserId: string,
  input: UpdateContactInput,
): Promise<ContactDto> {
  const result = await ContactModel.findOneAndUpdate(
    {
      ownerId: ownerObjectId(context),
      contactUserId: new Types.ObjectId(contactUserId),
    },
    { $set: { customName: input.customName } },
    { returnDocument: "after" },
  ).exec();

  if (result === null) {
    throw contactNotFound();
  }

  const user = await getUserById(contactUserId);
  if (user === null) {
    throw contactNotFound();
  }

  return toContactDto(result, user);
}

export async function removeContact(
  context: AuthContext,
  contactUserId: string,
): Promise<void> {
  const result = await ContactModel.deleteOne({
    ownerId: ownerObjectId(context),
    contactUserId: new Types.ObjectId(contactUserId),
  }).exec();

  if (result.deletedCount === 0) {
    throw contactNotFound();
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function listContacts(
  context: AuthContext,
  query: ContactListQuery,
): Promise<{ contacts: ContactDto[]; nextCursor: string | null }> {
  const ownerId = ownerObjectId(context);
  const cursor = decodeCursor(query.cursor);
  const contactFilter: Record<string, unknown> = { ownerId };

  if (query.search !== undefined && query.search.length > 0) {
    const search = new RegExp(escapeRegex(query.search), "i");
    const matchingUsers = await UserModel.find({
      $or: [
        { username: search },
        { usernameNormalized: search },
        { displayName: search },
        { phone: search },
      ],
    })
      .select("_id")
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();
    contactFilter.contactUserId = {
      $in: matchingUsers.map((user) => user._id),
    };
  }

  if (cursor !== null) {
    const cursorDate = new Date(cursor.createdAt);
    if (
      Number.isNaN(cursorDate.getTime()) ||
      !Types.ObjectId.isValid(cursor.id)
    ) {
      throw new AppError({
        code: "INVALID_CURSOR",
        message: "The pagination cursor is invalid.",
        statusCode: 400,
      });
    }
    contactFilter.$or = [
      { createdAt: { $lt: cursorDate } },
      { createdAt: cursorDate, _id: { $lt: new Types.ObjectId(cursor.id) } },
    ];
  }

  const contacts = await ContactModel.find(contactFilter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .exec();
  const hasNext = contacts.length > query.limit;
  const page = hasNext ? contacts.slice(0, query.limit) : contacts;
  const userIds = page.map((contact) => contact.contactUserId);
  const users = await UserModel.find({ _id: { $in: userIds } }).exec();
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  const safeContacts = page.flatMap((contact) => {
    const user = usersById.get(contact.contactUserId.toString());
    return user === undefined ? [] : [toContactDto(contact, user)];
  });
  const last = page.at(-1);

  return {
    contacts: safeContacts,
    nextCursor:
      hasNext && last !== undefined
        ? encodeCursor({
            createdAt: last.createdAt.toISOString(),
            id: last._id.toString(),
          })
        : null,
  };
}

export async function initializeContactModels(): Promise<void> {
  await ContactModel.init();
}
