import type { GroupDto } from "../../contracts/index.js";
import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import type { AuthContext } from "../auth/auth.types.js";
import { removeAvatar } from "../media/avatar.service.js";
import { UserModel } from "../users/user.model.js";
import { GroupModel } from "./group.model.js";
import { toGroupDto } from "./group.dto.js";
import type { GroupDocument } from "./group.types.js";
import type { CreateGroupInput } from "./group.validation.js";
import { areContacts } from "../../clients/relationship-client.js";

function ownerId(context: AuthContext): Types.ObjectId {
  return new Types.ObjectId(context.userId);
}

function groupError(
  code: string,
  message: string,
  statusCode: number,
): AppError {
  return new AppError({ code, message, statusCode });
}

async function mapGroups(groups: GroupDocument[]): Promise<GroupDto[]> {
  const ids = [
    ...new Set(
      groups.flatMap((group) => [
        group.ownerId.toString(),
        ...group.memberIds.map((memberId) => memberId.toString()),
      ]),
    ),
  ];
  const users = await UserModel.find({
    _id: { $in: ids },
    accountStatus: "active",
  }).exec();
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  return groups.flatMap((group) => {
    const dto = toGroupDto(group, usersById);
    return dto === null ? [] : [dto];
  });
}

async function validateMemberIds(
  context: AuthContext,
  memberUserIds: string[],
): Promise<Types.ObjectId[]> {
  const ids = [...new Set(memberUserIds)].filter((id) => id !== context.userId);
  const objectMemberIds = ids.map((id) => new Types.ObjectId(id));
  if (objectMemberIds.length === 0) return objectMemberIds;
  const [activeUsers, contacts] = await Promise.all([
    UserModel.countDocuments({
      _id: { $in: objectMemberIds },
      accountStatus: "active",
    }),
    areContacts(context.userId, ids),
  ]);
  if (
    activeUsers !== objectMemberIds.length ||
    !contacts
  ) {
    throw groupError(
      "GROUP_MEMBERS_MUST_BE_CONTACTS",
      "Only active contacts can be added to a group.",
      400,
    );
  }
  return objectMemberIds;
}

export async function getOwnedGroup(
  context: AuthContext,
  groupId: string,
): Promise<GroupDocument> {
  if (!Types.ObjectId.isValid(groupId))
    throw groupError("GROUP_NOT_FOUND", "The group was not found.", 404);
  const group = await GroupModel.findOne({
    _id: new Types.ObjectId(groupId),
    ownerId: ownerId(context),
  }).exec();
  if (group === null)
    throw groupError(
      "GROUP_OWNER_REQUIRED",
      "Only the group owner can manage this group.",
      403,
    );
  return group;
}

export async function listGroups(
  context: AuthContext,
): Promise<{ groups: GroupDto[] }> {
  const groups = await GroupModel.find({ memberIds: ownerId(context) })
    .sort({ updatedAt: -1, _id: -1 })
    .limit(100)
    .exec();
  return { groups: await mapGroups(groups) };
}

export async function createGroup(
  context: AuthContext,
  input: CreateGroupInput,
): Promise<GroupDto> {
  const owner = ownerId(context);
  const objectMemberIds = await validateMemberIds(context, input.memberUserIds);
  const group = await GroupModel.create({
    name: input.name,
    description: input.description,
    ownerId: owner,
    memberIds: [owner, ...objectMemberIds],
  });
  const [dto] = await mapGroups([group]);
  if (dto === undefined) {
    throw groupError(
      "GROUP_CREATE_FAILED",
      "The group could not be created.",
      500,
    );
  }
  return dto;
}

export async function updateGroup(
  context: AuthContext,
  groupId: string,
  input: CreateGroupInput,
): Promise<GroupDto> {
  const group = await getOwnedGroup(context, groupId);
  const memberIds = await validateMemberIds(context, input.memberUserIds);
  group.name = input.name;
  group.description = input.description;
  group.memberIds = [ownerId(context), ...memberIds];
  await group.save();
  const [dto] = await mapGroups([group]);
  if (dto === undefined)
    throw groupError("GROUP_NOT_FOUND", "The group was not found.", 404);
  return dto;
}

export async function deleteGroup(
  context: AuthContext,
  groupId: string,
): Promise<void> {
  const group = await getOwnedGroup(context, groupId);
  await GroupModel.deleteOne({ _id: group._id }).exec();
  await removeAvatar(group.avatarStorageKey).catch(() => undefined);
}

export async function initializeGroupModels(): Promise<void> {
  await GroupModel.init();
}
