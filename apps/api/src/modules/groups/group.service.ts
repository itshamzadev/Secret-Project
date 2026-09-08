import type { GroupDto } from "@terqivo/contracts";
import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import type { AuthContext } from "../auth/auth.types.js";
import { ContactModel } from "../contacts/contact.model.js";
import { UserModel } from "../users/user.model.js";
import { GroupModel } from "./group.model.js";
import { toGroupDto } from "./group.dto.js";
import type { GroupDocument } from "./group.types.js";
import type { CreateGroupInput } from "./group.validation.js";

function ownerId(context: AuthContext): Types.ObjectId {
  return new Types.ObjectId(context.userId);
}

function groupError(code: string, message: string, statusCode: number): AppError {
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
  const users = await UserModel.find({ _id: { $in: ids }, accountStatus: "active" }).exec();
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  return groups.flatMap((group) => {
    const dto = toGroupDto(group, usersById);
    return dto === null ? [] : [dto];
  });
}

export async function listGroups(context: AuthContext): Promise<{ groups: GroupDto[] }> {
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
  const memberIds = [...new Set(input.memberUserIds)].filter((id) => id !== context.userId);
  const objectMemberIds = memberIds.map((id) => new Types.ObjectId(id));
  if (objectMemberIds.length > 0) {
    const activeUsers = await UserModel.countDocuments({
      _id: { $in: objectMemberIds },
      accountStatus: "active",
    });
    const contacts = await ContactModel.countDocuments({
      ownerId: owner,
      contactUserId: { $in: objectMemberIds },
    });
    if (activeUsers !== objectMemberIds.length || contacts !== objectMemberIds.length) {
      throw groupError(
        "GROUP_MEMBERS_MUST_BE_CONTACTS",
        "Only active contacts can be added to a group.",
        400,
      );
    }
  }
  const group = await GroupModel.create({
    name: input.name,
    description: input.description,
    ownerId: owner,
    memberIds: [owner, ...objectMemberIds],
  });
  const [dto] = await mapGroups([group]);
  if (dto === undefined) {
    throw groupError("GROUP_CREATE_FAILED", "The group could not be created.", 500);
  }
  return dto;
}

export async function initializeGroupModels(): Promise<void> {
  await GroupModel.init();
}
