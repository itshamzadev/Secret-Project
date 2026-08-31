import type { AuthSessionDto } from "@terqivo/contracts";
import { Types } from "mongoose";

import { env } from "../../config/env.js";
import { AppError } from "../../core/errors.js";
import { disconnectSessionSockets } from "../../sockets/session-registry.js";
import {
  getMongoDuplicateFields,
  isMongoDuplicateKeyError,
} from "../../utils/mongo.js";
import { UserModel } from "../users/user.model.js";
import { toSafeUserDto } from "../users/user.dto.js";
import {
  emailExists,
  findUserForLogin,
  getUserById,
  normalizeEmail,
  normalizePhone,
  normalizeUsername,
  phoneExists,
  usernameExists,
} from "../users/user.service.js";
import type { UserDocument } from "../users/user.types.js";
import {
  AuthSessionModel,
  type AuthSessionDocument,
  type RevokeReason,
} from "./auth-session.model.js";
import { toAuthSessionDto } from "./auth.dto.js";
import {
  hashPassword,
  verifyPasswordAgainstUserOrDummy,
} from "./auth.security.js";
import {
  createAccessToken,
  createRefreshToken,
  createSessionId,
  extractSessionId,
  getRefreshTokenExpiry,
  hashRefreshToken,
  refreshTokenHashesMatch,
} from "./auth.tokens.js";
import type { DeviceMetadata, AuthResult, AuthContext } from "./auth.types.js";
import type { LoginInput, RegisterInput } from "./auth.validation.js";

const INVALID_CREDENTIALS = new AppError({
  code: "INVALID_CREDENTIALS",
  message: "Invalid identifier or password.",
  statusCode: 401,
});

function invalidRefreshToken(): AppError {
  return new AppError({
    code: "INVALID_REFRESH_TOKEN",
    message: "The refresh token is invalid or expired.",
    statusCode: 401,
  });
}

function accountStatusError(accountStatus: "suspended" | "disabled"): AppError {
  return new AppError({
    code:
      accountStatus === "suspended" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_DISABLED",
    message:
      accountStatus === "suspended"
        ? "This account is suspended."
        : "This account is disabled.",
    statusCode: 403,
  });
}

function ensureAccountCanAuthenticate(user: UserDocument): void {
  if (user.accountStatus !== "active") {
    throw accountStatusError(user.accountStatus);
  }
}

function defaultDeviceName(platform: DeviceMetadata["platform"]): string {
  const names: Record<DeviceMetadata["platform"], string> = {
    web: "Web browser",
    android: "Android device",
    ios: "iPhone or iPad",
    windows: "Windows desktop",
    macos: "macOS desktop",
    linux: "Linux desktop",
    unknown: "Unknown device",
  };

  return names[platform];
}

async function issueSession(
  user: UserDocument,
  device: DeviceMetadata,
): Promise<AuthResult> {
  const sessionId = createSessionId();
  const refreshToken = createRefreshToken(sessionId);
  const now = new Date();
  const expiresAt = getRefreshTokenExpiry();

  const session = await AuthSessionModel.create({
    userId: user._id,
    sessionId,
    refreshTokenHash: hashRefreshToken(refreshToken),
    deviceId: device.deviceId,
    deviceName: device.deviceName || defaultDeviceName(device.platform),
    platform: device.platform,
    userAgent: device.userAgent,
    ipAddress: device.ipAddress,
    createdAt: now,
    lastUsedAt: now,
    lastRefreshAt: now,
    expiresAt,
    revokedAt: null,
    revokeReason: null,
  });

  const accessToken = await createAccessToken(user._id.toString(), sessionId);

  return {
    user: toSafeUserDto(user),
    session: toAuthSessionDto(session, sessionId),
    accessToken,
    accessTokenExpiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshToken,
  };
}

function duplicateRegistrationError(error: unknown): AppError | null {
  if (!isMongoDuplicateKeyError(error)) {
    return null;
  }

  const duplicateFields = getMongoDuplicateFields(error);
  if (duplicateFields.includes("usernameNormalized")) {
    return new AppError({
      code: "USERNAME_TAKEN",
      message: "That username is already in use.",
      statusCode: 409,
    });
  }

  if (duplicateFields.includes("emailNormalized")) {
    return new AppError({
      code: "EMAIL_TAKEN",
      message: "That email address is already in use.",
      statusCode: 409,
    });
  }

  if (duplicateFields.includes("phoneNormalized")) {
    return new AppError({
      code: "PHONE_TAKEN",
      message: "That phone number is already in use.",
      statusCode: 409,
    });
  }

  return new AppError({
    code: "REGISTRATION_CONFLICT",
    message: "The account could not be created because of a conflicting value.",
    statusCode: 409,
  });
}

export function createDeviceMetadata(
  input: {
    deviceId?: string | undefined;
    deviceName?: string | undefined;
    platform: DeviceMetadata["platform"];
  },
  userAgent: string | undefined,
  ipAddress: string | undefined,
): DeviceMetadata {
  return {
    deviceId: input.deviceId ?? null,
    deviceName: input.deviceName ?? defaultDeviceName(input.platform),
    platform: input.platform,
    userAgent: (userAgent ?? "unknown").slice(0, 512),
    ipAddress: (ipAddress ?? "unknown").slice(0, 128),
  };
}

export async function registerUser(
  input: RegisterInput,
  device: DeviceMetadata,
): Promise<AuthResult> {
  const usernameNormalized = normalizeUsername(input.username);
  const emailNormalized =
    input.email === undefined ? null : normalizeEmail(input.email);
  const phoneNormalized = normalizePhone(input.phone);

  const [usernameConflict, emailConflict, phoneConflict] = await Promise.all([
    usernameExists(usernameNormalized),
    emailNormalized === null
      ? Promise.resolve(false)
      : emailExists(emailNormalized),
    phoneExists(phoneNormalized),
  ]);

  if (usernameConflict) {
    throw new AppError({
      code: "USERNAME_TAKEN",
      message: "That username is already in use.",
      statusCode: 409,
    });
  }

  if (emailConflict) {
    throw new AppError({
      code: "EMAIL_TAKEN",
      message: "That email address is already in use.",
      statusCode: 409,
    });
  }

  if (phoneConflict) {
    throw new AppError({
      code: "PHONE_TAKEN",
      message: "That phone number is already in use.",
      statusCode: 409,
    });
  }

  try {
    const user = await UserModel.create({
      username: input.username.trim(),
      usernameNormalized,
      displayName: input.name.trim(),
      email: emailNormalized,
      emailNormalized,
      phone: phoneNormalized,
      phoneNormalized,
      passwordHash: await hashPassword(input.password),
      avatarUrl: null,
      bio: null,
      emailVerified: false,
      phoneVerified: false,
      accountStatus: "active",
      role: "user",
      lastSeenAt: new Date(),
    });

    return issueSession(user, device);
  } catch (error) {
    const registrationError = duplicateRegistrationError(error);
    if (registrationError !== null) {
      throw registrationError;
    }
    throw error;
  }
}

export async function loginUser(
  input: LoginInput,
  device: DeviceMetadata,
): Promise<AuthResult> {
  const identifierNormalized = input.identifier.trim().toLowerCase();
  const user = await findUserForLogin(identifierNormalized);
  const passwordValid = await verifyPasswordAgainstUserOrDummy(
    input.password,
    user?.passwordHash ?? null,
  );

  if (user === null || !passwordValid) {
    throw INVALID_CREDENTIALS;
  }

  ensureAccountCanAuthenticate(user);
  user.lastSeenAt = new Date();
  await user.save();

  return issueSession(user, device);
}

export async function refreshUserSession(
  refreshToken: string,
): Promise<AuthResult> {
  const sessionId = extractSessionId(refreshToken);
  if (sessionId === null) {
    throw invalidRefreshToken();
  }

  const session = await AuthSessionModel.findOne({ sessionId })
    .select("+refreshTokenHash")
    .exec();
  const now = new Date();

  if (
    session === null ||
    session.revokedAt !== null ||
    session.expiresAt.getTime() <= now.getTime()
  ) {
    throw invalidRefreshToken();
  }

  const presentedHash = hashRefreshToken(refreshToken);
  const nextRefreshToken = createRefreshToken(sessionId);
  const nextRefreshTokenHash = hashRefreshToken(nextRefreshToken);

  const rotatedSession = await AuthSessionModel.findOneAndUpdate(
    {
      _id: session._id,
      sessionId,
      refreshTokenHash: presentedHash,
      revokedAt: null,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        refreshTokenHash: nextRefreshTokenHash,
        lastUsedAt: now,
        lastRefreshAt: now,
        expiresAt: getRefreshTokenExpiry(),
      },
    },
    { returnDocument: "after" },
  ).exec();

  if (rotatedSession === null) {
    const currentSession = await AuthSessionModel.findOne({ sessionId })
      .select("+refreshTokenHash")
      .exec();

    if (
      currentSession !== null &&
      currentSession.revokedAt === null &&
      currentSession.expiresAt.getTime() > now.getTime() &&
      !refreshTokenHashesMatch(presentedHash, currentSession.refreshTokenHash)
    ) {
      await revokeSessionDocument(currentSession, "refresh_token_reuse");
    }

    throw invalidRefreshToken();
  }

  const user = await getUserById(session.userId.toString());
  if (user === null) {
    await revokeSessionDocument(rotatedSession, "account_status_change");
    throw invalidRefreshToken();
  }

  try {
    ensureAccountCanAuthenticate(user);
  } catch (error) {
    await revokeSessionDocument(rotatedSession, "account_status_change");
    throw error;
  }

  const accessToken = await createAccessToken(user._id.toString(), sessionId);

  return {
    user: toSafeUserDto(user),
    session: toAuthSessionDto(rotatedSession, sessionId),
    accessToken,
    accessTokenExpiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: nextRefreshToken,
  };
}

export async function getActiveSession(
  userId: string,
  sessionId: string,
): Promise<AuthSessionDocument | null> {
  if (!Types.ObjectId.isValid(userId)) {
    return null;
  }

  return AuthSessionModel.findOne({
    userId: new Types.ObjectId(userId),
    sessionId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).exec();
}

async function revokeSessionDocument(
  session: AuthSessionDocument,
  reason: RevokeReason,
): Promise<void> {
  if (session.revokedAt === null) {
    session.revokedAt = new Date();
    session.revokeReason = reason;
    await session.save();
    disconnectSessionSockets(session.sessionId);
  }
}

export async function revokeCurrentSession(
  context: AuthContext,
): Promise<void> {
  if (!Types.ObjectId.isValid(context.userId)) {
    return;
  }

  const result = await AuthSessionModel.updateOne(
    {
      userId: new Types.ObjectId(context.userId),
      sessionId: context.sessionId,
      revokedAt: null,
    },
    {
      $set: {
        revokedAt: new Date(),
        revokeReason: "logout",
      },
    },
  ).exec();
  if (result.modifiedCount > 0) {
    disconnectSessionSockets(context.sessionId);
  }
}

export async function revokeAllSessions(context: AuthContext): Promise<number> {
  if (!Types.ObjectId.isValid(context.userId)) {
    return 0;
  }

  const activeSessions = await AuthSessionModel.find({
    userId: new Types.ObjectId(context.userId),
    revokedAt: null,
  })
    .select({ sessionId: 1 })
    .lean<Array<{ sessionId: string }>>()
    .exec();

  const result = await AuthSessionModel.updateMany(
    {
      userId: new Types.ObjectId(context.userId),
      revokedAt: null,
    },
    {
      $set: {
        revokedAt: new Date(),
        revokeReason: "logout_all",
      },
    },
  ).exec();

  for (const session of activeSessions) {
    disconnectSessionSockets(session.sessionId);
  }

  return result.modifiedCount;
}

export async function listActiveSessions(
  context: AuthContext,
): Promise<AuthSessionDto[]> {
  if (!Types.ObjectId.isValid(context.userId)) {
    return [];
  }

  const sessions = await AuthSessionModel.find({
    userId: new Types.ObjectId(context.userId),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ lastUsedAt: -1 })
    .exec();

  return sessions.map((session) =>
    toAuthSessionDto(session, context.sessionId),
  );
}

export async function revokeOwnedSession(
  context: AuthContext,
  sessionId: string,
): Promise<void> {
  if (!Types.ObjectId.isValid(context.userId)) {
    throw new AppError({
      code: "SESSION_NOT_FOUND",
      message: "The session was not found.",
      statusCode: 404,
    });
  }

  const session = await AuthSessionModel.findOneAndUpdate(
    {
      userId: new Types.ObjectId(context.userId),
      sessionId,
      revokedAt: null,
    },
    {
      $set: {
        revokedAt: new Date(),
        revokeReason: "logout",
      },
    },
    { returnDocument: "after" },
  ).exec();

  if (session === null) {
    throw new AppError({
      code: "SESSION_NOT_FOUND",
      message: "The session was not found.",
      statusCode: 404,
    });
  }
  disconnectSessionSockets(session.sessionId);
}

export async function getCurrentUser(
  context: AuthContext,
): Promise<UserDocument> {
  const user = await getUserById(context.userId);
  if (user === null) {
    throw new AppError({
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication is required.",
      statusCode: 401,
    });
  }

  return user;
}

export async function initializeAuthModels(): Promise<void> {
  await UserModel.syncIndexes();
  await AuthSessionModel.init();
}
