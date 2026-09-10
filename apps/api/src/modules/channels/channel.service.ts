import type { ChannelDto, ChannelPostDto } from "@terqivo/contracts";
import { Types } from "mongoose";

import { AppError } from "../../core/errors.js";
import { isMongoDuplicateKeyError } from "../../utils/mongo.js";
import type { AuthContext } from "../auth/auth.types.js";
import { removeAvatar } from "../media/avatar.service.js";
import { UserModel } from "../users/user.model.js";
import { ChannelModel, ChannelPostModel } from "./channel.model.js";
import { toChannelDto, toChannelPostDto } from "./channel.dto.js";
import type {
  CreateChannelInput,
  CreateChannelPostInput,
} from "./channel.validation.js";
import type { ChannelDocument } from "./channel.types.js";

function channelError(
  code: string,
  message: string,
  statusCode: number,
): AppError {
  return new AppError({ code, message, statusCode });
}

function objectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

async function getChannel(channelId: string) {
  const channel = await ChannelModel.findById(objectId(channelId)).exec();
  if (channel === null)
    throw channelError("CHANNEL_NOT_FOUND", "The channel was not found.", 404);
  return channel;
}

export async function getOwnedChannel(
  context: AuthContext,
  channelId: string,
): Promise<ChannelDocument> {
  const channel = await getChannel(channelId);
  if (channel.ownerId.toString() !== context.userId)
    throw channelError(
      "CHANNEL_OWNER_REQUIRED",
      "Only the channel owner can manage this channel.",
      403,
    );
  return channel;
}

async function getActiveUser(userId: Types.ObjectId) {
  const user = await UserModel.findOne({
    _id: userId,
    accountStatus: "active",
  }).exec();
  if (user === null)
    throw channelError(
      "CHANNEL_USER_NOT_FOUND",
      "The channel user was not found.",
      404,
    );
  return user;
}

async function latestPost(
  channelId: Types.ObjectId,
): Promise<ChannelPostDto | null> {
  const post = await ChannelPostModel.findOne({ channelId })
    .sort({ createdAt: -1, _id: -1 })
    .exec();
  if (post === null) return null;
  return toChannelPostDto(post, await getActiveUser(post.authorId));
}

export async function listChannels(
  context: AuthContext,
): Promise<{ channels: ChannelDto[] }> {
  const channels = await ChannelModel.find()
    .sort({ updatedAt: -1, _id: -1 })
    .limit(100)
    .exec();
  return {
    channels: await Promise.all(
      channels.map(async (channel) =>
        toChannelDto(
          channel,
          await getActiveUser(channel.ownerId),
          context.userId,
          await latestPost(channel._id),
        ),
      ),
    ),
  };
}

export async function createChannel(
  context: AuthContext,
  input: CreateChannelInput,
): Promise<ChannelDto> {
  try {
    const channel = await ChannelModel.create({
      ...input,
      ownerId: objectId(context.userId),
      followerIds: [objectId(context.userId)],
    });
    return toChannelDto(
      channel,
      await getActiveUser(channel.ownerId),
      context.userId,
      null,
    );
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) {
      throw channelError(
        "CHANNEL_HANDLE_TAKEN",
        "That channel handle is already in use.",
        409,
      );
    }
    throw error;
  }
}

export async function followChannel(
  context: AuthContext,
  channelId: string,
  follow: boolean,
): Promise<ChannelDto> {
  const channel = await getChannel(channelId);
  const updated = await ChannelModel.findByIdAndUpdate(
    channel._id,
    follow
      ? { $addToSet: { followerIds: objectId(context.userId) } }
      : { $pull: { followerIds: objectId(context.userId) } },
    { returnDocument: "after" },
  ).exec();
  if (updated === null)
    throw channelError("CHANNEL_NOT_FOUND", "The channel was not found.", 404);
  return toChannelDto(
    updated,
    await getActiveUser(updated.ownerId),
    context.userId,
    await latestPost(updated._id),
  );
}

export async function listChannelPosts(
  context: AuthContext,
  channelId: string,
): Promise<{ posts: ChannelPostDto[] }> {
  const channel = await getChannel(channelId);
  const posts = await ChannelPostModel.find({ channelId: channel._id })
    .sort({ createdAt: -1, _id: -1 })
    .limit(100)
    .exec();
  const authors = await UserModel.find({
    _id: { $in: posts.map((post) => post.authorId) },
    accountStatus: "active",
  }).exec();
  const authorsById = new Map(
    authors.map((author) => [author._id.toString(), author]),
  );
  return {
    posts: posts.flatMap((post) => {
      const author = authorsById.get(post.authorId.toString());
      return author === undefined ? [] : [toChannelPostDto(post, author)];
    }),
  };
}

export async function createChannelPost(
  context: AuthContext,
  channelId: string,
  input: CreateChannelPostInput,
): Promise<ChannelPostDto> {
  const channel = await getChannel(channelId);
  if (channel.ownerId.toString() !== context.userId) {
    throw channelError(
      "CHANNEL_OWNER_REQUIRED",
      "Only the channel owner can publish posts.",
      403,
    );
  }
  const post = await ChannelPostModel.create({
    channelId: channel._id,
    authorId: objectId(context.userId),
    text: input.text,
  });
  await ChannelModel.updateOne(
    { _id: channel._id },
    { $set: { updatedAt: new Date() } },
  ).exec();
  return toChannelPostDto(post, await getActiveUser(post.authorId));
}

export async function updateChannel(
  context: AuthContext,
  channelId: string,
  input: Pick<CreateChannelInput, "name" | "description">,
): Promise<ChannelDto> {
  const channel = await getOwnedChannel(context, channelId);
  channel.name = input.name;
  channel.description = input.description;
  await channel.save();
  return toChannelDto(
    channel,
    await getActiveUser(channel.ownerId),
    context.userId,
    await latestPost(channel._id),
  );
}

export async function deleteChannel(
  context: AuthContext,
  channelId: string,
): Promise<void> {
  const channel = await getOwnedChannel(context, channelId);
  await Promise.all([
    ChannelModel.deleteOne({ _id: channel._id }).exec(),
    ChannelPostModel.deleteMany({ channelId: channel._id }).exec(),
  ]);
  await removeAvatar(channel.avatarStorageKey).catch(() => undefined);
}

export async function deleteChannelPost(
  context: AuthContext,
  channelId: string,
  postId: string,
): Promise<void> {
  const channel = await getOwnedChannel(context, channelId);
  if (!Types.ObjectId.isValid(postId))
    throw channelError(
      "CHANNEL_POST_NOT_FOUND",
      "The channel post was not found.",
      404,
    );
  const result = await ChannelPostModel.deleteOne({
    _id: new Types.ObjectId(postId),
    channelId: channel._id,
  }).exec();
  if (result.deletedCount === 0)
    throw channelError(
      "CHANNEL_POST_NOT_FOUND",
      "The channel post was not found.",
      404,
    );
}

export async function initializeChannelModels(): Promise<void> {
  await Promise.all([ChannelModel.init(), ChannelPostModel.init()]);
}
