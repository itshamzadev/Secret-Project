// Servers/callserver/server.ts
import { createServer } from "node:http";
import cors from "cors";
import express, { Router } from "express";
import { model as model9, Schema as Schema9, Types as Types7 } from "mongoose";
import { Server } from "socket.io";
import { z as z3 } from "zod";

// packages/contracts/src/index.ts
var clientPlatforms = [
  "web",
  "android",
  "ios",
  "windows",
  "macos",
  "linux",
  "unknown"
];
var callTypes = ["voice", "video"];
var callStatuses = [
  "ringing",
  "accepted",
  "declined",
  "missed",
  "ended",
  "cancelled",
  "failed"
];
var callEndReasons = [
  "declined",
  "cancelled",
  "timeout",
  "remote-ended",
  "connection-failed",
  "local-ended",
  "unknown"
];
var pushPlatforms = ["android"];

// apps/api/src/config/env.ts
import "dotenv/config";
import { z } from "zod";
var environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().min(1).max(65535),
  MONGODB_URI: z.string().trim().min(1),
  REDIS_URL: z.string().trim().min(1),
  WEB_ORIGIN: z.string().trim().min(1).refine(
    (value) => value.split(",").every((origin) => {
      try {
        const parsedOrigin = new URL(origin.trim());
        return parsedOrigin.protocol === "http:" || parsedOrigin.protocol === "https:";
      } catch {
        return false;
      }
    }),
    "must contain one or more valid HTTP(S) origins separated by commas"
  ),
  // Optional public origin used for security policies that only make sense
  // when the application is actually served over HTTPS.
  PUBLIC_URL: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? void 0 : value,
    z.string().trim().url().refine((value) => {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    }, "must be an HTTP(S) URL").optional()
  ),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().trim().min(1).default("terqivo-connect"),
  JWT_AUDIENCE: z.string().trim().min(1).default("terqivo-clients"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(3650).default(365),
  AUTH_REGISTER_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1e4).default(10),
  AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1e4).default(20),
  AUTH_REFRESH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1e4).default(60),
  ICE_SERVERS: z.string().trim().min(1).default('[{"urls":"stun:stun.l.google.com:19302"}]'),
  CALL_RING_TIMEOUT_SECONDS: z.coerce.number().int().min(15).max(120).default(35),
  CALL_START_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1e4).default(10),
  CALL_ACTIVE_TTL_SECONDS: z.coerce.number().int().min(300).max(86400).default(14400),
  EXPO_PUSH_API_URL: z.string().url().default("https://exp.host/--/api/v2/push/send"),
  EXPO_PUSH_RECEIPTS_URL: z.string().url().default("https://exp.host/--/api/v2/push/getReceipts"),
  EXPO_ACCESS_TOKEN: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? void 0 : value,
    z.string().trim().min(1).optional()
  ),
  MEDIA_STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  MEDIA_STORAGE_PATH: z.string().trim().min(1).default("./storage/media"),
  MEDIA_MAX_FILE_SIZE_BYTES: z.coerce.number().int().min(1024).max(250 * 1024 * 1024).default(50 * 1024 * 1024),
  SEARCH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1e3).default(30),
  GEMINI_API_KEY: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? void 0 : value,
    z.string().trim().min(1).optional()
  ),
  GEMINI_MODEL: z.string().trim().min(1).default("gemini-3.7-flash"),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1e3).default(20),
  // Keep plaintext compatible during migration. Enable only after every
  // production client has a validated E2EFE implementation.
  E2EFE_ENFORCEMENT_ENABLED: z.coerce.boolean().default(false),
  ADMIN_JWT_SECRET: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? void 0 : value,
    z.string().min(32).optional()
  ),
  ADMIN_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  ADMIN_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1e3).default(10),
  ADMIN_BOOTSTRAP_EMAIL: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? void 0 : value,
    z.string().trim().email().optional()
  ),
  ADMIN_BOOTSTRAP_PASSWORD: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? void 0 : value,
    z.string().min(12).max(1024).optional()
  ),
  ADMIN_BOOTSTRAP_DISPLAY_NAME: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? void 0 : value,
    z.string().trim().min(1).max(100).optional()
  ),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
});
var parsedEnvironment = environmentSchema.safeParse(process.env);
if (!parsedEnvironment.success) {
  const issues = parsedEnvironment.error.issues.map(
    (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`
  ).join("; ");
  throw new Error(`Invalid environment configuration: ${issues}`);
}
var env = parsedEnvironment.data;
var allowedWebOrigins = env.WEB_ORIGIN.split(",").map(
  (origin) => origin.trim()
);

// apps/api/src/core/errors.ts
var AppError = class extends Error {
  code;
  statusCode;
  details;
  constructor(options) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
  }
};

// apps/api/src/middleware/error-handler.ts
import { z as z2, ZodError } from "zod";

// apps/api/src/lib/logger.ts
import pino from "pino";
var sensitiveFieldNames = [
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "access_token",
  "refresh_token",
  "pushToken",
  "push_token",
  "expoPushToken",
  "expo_push_token",
  "fcmToken",
  "fcm_token",
  "sdp",
  "candidate",
  "iceCandidate",
  "ice_candidate",
  "credential",
  "turnCredential",
  "turn_credential"
];
var nestedSensitivePaths = sensitiveFieldNames.flatMap((fieldName) => [
  `*.${fieldName}`,
  `*.*.${fieldName}`,
  `*.*.*.${fieldName}`
]);
var logRedaction = {
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    'req.raw.headers["authorization"]',
    'req.raw.headers["cookie"]',
    'res.headers["set-cookie"]',
    'res.raw.headers["set-cookie"]',
    "authorization",
    "cookie",
    '["set-cookie"]',
    ...sensitiveFieldNames,
    ...nestedSensitivePaths
  ],
  censor: "[REDACTED]"
};
var loggerOptions = {
  level: env.LOG_LEVEL,
  redact: logRedaction
};
var logger = env.NODE_ENV === "development" ? pino({
  ...loggerOptions,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard"
    }
  }
}) : pino(loggerOptions);

// apps/api/src/middleware/error-handler.ts
function isHttpLikeError(error) {
  return typeof error === "object" && error !== null && ("status" in error || "type" in error);
}
function isZodError(error) {
  return error instanceof ZodError;
}
var errorHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  let statusCode = 500;
  let code = "INTERNAL_SERVER_ERROR";
  let message = "An unexpected error occurred.";
  let details;
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (isZodError(error)) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Request validation failed.";
    details = error.issues;
  } else if (isHttpLikeError(error) && (error.status === 400 || error.status === 413)) {
    statusCode = error.status === 413 ? 413 : 400;
    code = error.type === "entity.too.large" ? "REQUEST_TOO_LARGE" : "INVALID_REQUEST";
    message = error.type === "entity.too.large" ? "Request body is too large." : "Invalid request.";
  }
  if (statusCode >= 500) {
    logger.error({ err: error }, message);
  } else {
    logger.warn({ err: error }, message);
  }
  const safeError = {
    code,
    message: env.NODE_ENV === "production" && statusCode >= 500 ? "An unexpected error occurred." : message
  };
  if (details === void 0) {
    response.status(statusCode).json({ success: false, error: safeError });
    return;
  }
  response.status(statusCode).json({
    success: false,
    error: {
      ...safeError,
      details: z2.array(z2.unknown()).safeParse(details).success ? details : void 0
    }
  });
};

// apps/api/src/middleware/not-found.ts
var notFoundHandler = (_request, _response, next) => {
  next(
    new AppError({
      code: "ROUTE_NOT_FOUND",
      message: "The requested route was not found.",
      statusCode: 404
    })
  );
};

// apps/api/src/middleware/authenticate.ts
import { Types as Types3 } from "mongoose";

// apps/api/src/modules/auth/auth.service.ts
import { Types as Types2 } from "mongoose";

// apps/api/src/utils/mongo.ts
function isRecord(value) {
  return typeof value === "object" && value !== null;
}

// apps/api/src/modules/users/user.model.ts
import { model, Schema } from "mongoose";
var userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 30
    },
    usernameNormalized: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 254
    },
    emailNormalized: {
      type: String,
      default: null,
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      default: null,
      trim: true,
      maxlength: 32
    },
    phoneNormalized: {
      type: String,
      default: null,
      trim: true,
      maxlength: 32
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    avatarUrl: {
      type: String,
      default: null,
      maxlength: 2048
    },
    avatarStorageKey: { type: String, default: null, maxlength: 128 },
    avatarMimeType: { type: String, default: null, maxlength: 100 },
    bio: {
      type: String,
      default: null,
      maxlength: 500
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    phoneVerified: {
      type: Boolean,
      default: false
    },
    accountStatus: {
      type: String,
      enum: ["active", "suspended", "disabled"],
      default: "active"
    },
    role: {
      type: String,
      enum: ["user", "moderator", "admin"],
      default: "user"
    },
    accountType: {
      type: String,
      enum: ["personal", "professional", "business"],
      default: "personal"
    },
    userTier: {
      type: String,
      enum: ["normal", "special", "special_pro", "ultra_special"],
      default: "normal"
    },
    badges: {
      type: [String],
      enum: ["verified", "terqivo"],
      default: []
    },
    lastSeenAt: {
      type: Date,
      default: null
    }
  },
  {
    collection: "users",
    timestamps: true,
    versionKey: false
  }
);
userSchema.index({ usernameNormalized: 1 }, { unique: true });
userSchema.index(
  { emailNormalized: 1 },
  {
    unique: true,
    partialFilterExpression: { emailNormalized: { $type: "string" } }
  }
);
userSchema.index(
  { phoneNormalized: 1 },
  {
    unique: true,
    partialFilterExpression: { phoneNormalized: { $type: "string" } }
  }
);
var UserModel = model("User", userSchema);

// apps/api/src/modules/users/user.service.ts
import { Types } from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js";
async function getUserById(userId) {
  if (!Types.ObjectId.isValid(userId)) {
    return null;
  }
  return UserModel.findById(userId).exec();
}

// apps/api/src/modules/auth/auth-session.model.ts
import { model as model2, Schema as Schema2 } from "mongoose";
var authSessionSchema = new Schema2(
  {
    userId: {
      type: Schema2.Types.ObjectId,
      ref: "User",
      required: true
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    refreshTokenHash: {
      type: String,
      required: true,
      select: false
    },
    deviceId: {
      type: String,
      default: null,
      maxlength: 128
    },
    deviceName: {
      type: String,
      required: true,
      maxlength: 100
    },
    platform: {
      type: String,
      enum: [...clientPlatforms],
      required: true
    },
    appVersion: {
      type: String,
      default: null,
      maxlength: 32
    },
    appBuild: {
      type: Number,
      default: null,
      min: 0
    },
    userAgent: {
      type: String,
      required: true,
      maxlength: 512
    },
    ipAddress: {
      type: String,
      required: true,
      maxlength: 128
    },
    createdAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    lastRefreshAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    revokedAt: {
      type: Date,
      default: null
    },
    revokeReason: {
      type: String,
      enum: [
        "logout",
        "logout_all",
        "refresh_token_reuse",
        "account_status_change",
        "admin_password_change"
      ],
      default: null
    }
  },
  {
    collection: "auth_sessions",
    versionKey: false
  }
);
authSessionSchema.index({ userId: 1 });
var AuthSessionModel = model2(
  "AuthSession",
  authSessionSchema
);

// apps/api/src/modules/auth/auth.security.ts
import argon2 from "argon2";

// apps/api/src/modules/auth/auth.tokens.ts
import { jwtVerify, SignJWT } from "jose";
async function verifyAccessToken(accessToken) {
  const { payload } = await jwtVerify(
    accessToken,
    new TextEncoder().encode(env.JWT_ACCESS_SECRET),
    {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      algorithms: ["HS256"]
    }
  );
  if (typeof payload.sub !== "string" || typeof payload.sid !== "string") {
    throw new Error("Access token claims are incomplete");
  }
  return payload;
}

// apps/api/src/modules/auth/auth.service.ts
var INVALID_CREDENTIALS = new AppError({
  code: "INVALID_CREDENTIALS",
  message: "Invalid identifier or password.",
  statusCode: 401
});
async function getActiveSession(userId, sessionId) {
  if (!Types2.ObjectId.isValid(userId)) {
    return null;
  }
  return AuthSessionModel.findOne({
    userId: new Types2.ObjectId(userId),
    sessionId,
    revokedAt: null,
    expiresAt: { $gt: /* @__PURE__ */ new Date() }
  }).exec();
}
async function initializeAuthModels() {
  await UserModel.syncIndexes();
  await AuthSessionModel.init();
}

// apps/api/src/middleware/authenticate.ts
function authenticationRequired() {
  return new AppError({
    code: "AUTHENTICATION_REQUIRED",
    message: "Authentication is required.",
    statusCode: 401
  });
}
function invalidAccessToken() {
  return new AppError({
    code: "INVALID_ACCESS_TOKEN",
    message: "The access token is invalid or expired.",
    statusCode: 401
  });
}
function accountStatusError(accountStatus) {
  return new AppError({
    code: accountStatus === "suspended" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_DISABLED",
    message: accountStatus === "suspended" ? "This account is suspended." : "This account is disabled.",
    statusCode: 403
  });
}
function extractBearerToken(authorizationHeader) {
  if (authorizationHeader === void 0) {
    throw authenticationRequired();
  }
  const parts = authorizationHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer" || parts[1] === void 0 || parts[1].length === 0) {
    throw invalidAccessToken();
  }
  return parts[1];
}
var authenticate = (request, _response, next) => {
  void (async () => {
    try {
      const accessToken = extractBearerToken(request.get("authorization"));
      const claims = await verifyAccessToken(accessToken).catch(() => {
        throw invalidAccessToken();
      });
      if (!Types3.ObjectId.isValid(claims.sub)) {
        throw invalidAccessToken();
      }
      const [user, session] = await Promise.all([
        getUserById(claims.sub),
        getActiveSession(claims.sub, claims.sid)
      ]);
      if (user === null || session === null) {
        throw invalidAccessToken();
      }
      if (user.accountStatus !== "active") {
        throw accountStatusError(user.accountStatus);
      }
      request.auth = {
        userId: claims.sub,
        sessionId: claims.sid
      };
      next();
    } catch (error) {
      next(error instanceof AppError ? error : invalidAccessToken());
    }
  })();
};
function requireAuthContext(request) {
  if (request.auth === void 0) {
    throw authenticationRequired();
  }
  return request.auth;
}

// apps/api/src/lib/database.ts
import mongoose from "mongoose";
async function connectDatabase() {
  logger.info("Connecting to MongoDB");
  await mongoose.connect(env.MONGODB_URI);
  logger.info("MongoDB connection established");
}
async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info("MongoDB connection closed");
  }
}
function getDatabaseStatus() {
  return mongoose.connection.readyState === 1 ? "connected" : "disconnected";
}

// apps/api/src/lib/redis.ts
import { createClient } from "redis";
var redisClient = createClient({ url: env.REDIS_URL });
redisClient.on("error", (error) => {
  logger.error({ err: error }, "Redis client error");
});
async function connectRedis() {
  if (!redisClient.isOpen) {
    logger.info("Connecting to Redis");
    await redisClient.connect();
    logger.info("Redis connection established");
  }
}
async function disconnectRedis() {
  if (redisClient.isOpen) {
    await redisClient.quit();
    logger.info("Redis connection closed");
  }
}
function getRedisStatus() {
  return redisClient.isReady ? "connected" : "disconnected";
}

// apps/api/src/modules/conversations/conversation.service.ts
import { Types as Types5 } from "mongoose";

// apps/api/src/utils/cursors.ts
function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
function decodeCursor(value) {
  if (value === void 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    );
    if (!isRecord(parsed) || typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") {
      throw new Error("invalid cursor");
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    throw new AppError({
      code: "INVALID_CURSOR",
      message: "The pagination cursor is invalid.",
      statusCode: 400
    });
  }
}

// apps/api/src/modules/contacts/contact.model.ts
import { model as model3, Schema as Schema3 } from "mongoose";
var contactSchema = new Schema3(
  {
    ownerId: {
      type: Schema3.Types.ObjectId,
      ref: "User",
      required: true
    },
    contactUserId: {
      type: Schema3.Types.ObjectId,
      ref: "User",
      required: true
    },
    customName: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100
    }
  },
  {
    collection: "contacts",
    timestamps: true,
    versionKey: false
  }
);
contactSchema.index({ ownerId: 1, contactUserId: 1 }, { unique: true });
contactSchema.index({ ownerId: 1, createdAt: -1 });
var ContactModel = model3("Contact", contactSchema);

// apps/api/src/modules/messages/message.model.ts
import { model as model4, Schema as Schema4 } from "mongoose";
var reactionSchema = new Schema4(
  {
    userId: { type: Schema4.Types.ObjectId, ref: "User", required: true },
    emoji: {
      type: String,
      enum: ["\u2764\uFE0F", "\u{1F602}", "\u{1F62E}", "\u{1F622}", "\u{1F44D}", "\u{1F64F}"],
      required: true
    },
    reactedAt: { type: Date, required: true }
  },
  { _id: false }
);
var mediaSchema = new Schema4(
  {
    url: { type: String, required: true },
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 1 },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    durationSeconds: { type: Number, default: null },
    thumbnailUrl: { type: String, default: null },
    fileName: { type: String, default: null },
    encrypted: { type: Boolean, default: false },
    encryptionVersion: { type: String, default: null }
  },
  { _id: false }
);
var messageSchema = new Schema4(
  {
    conversationId: {
      type: Schema4.Types.ObjectId,
      ref: "Conversation",
      required: true
    },
    senderId: {
      type: Schema4.Types.ObjectId,
      ref: "User",
      required: true
    },
    clientMessageId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128
    },
    type: {
      type: String,
      enum: ["text", "image", "video", "audio", "file"],
      required: true
    },
    text: {
      type: String,
      required: false,
      trim: true,
      default: null,
      maxlength: 4e3
    },
    e2efeVersion: {
      type: String,
      enum: ["terqivo-e2efe-v1", null],
      default: null
    },
    senderDeviceId: { type: Number, min: 1, max: 127, default: null },
    e2efeRevisionId: { type: String, default: null, maxlength: 128 },
    media: { type: mediaSchema, default: null },
    reactions: { type: [reactionSchema], default: [] },
    editedAt: { type: Date, default: null },
    deletedForEveryoneAt: { type: Date, default: null },
    deletedForEveryoneBy: {
      type: Schema4.Types.ObjectId,
      ref: "User",
      default: null
    },
    pinnedForEveryoneAt: { type: Date, default: null },
    pinnedForEveryoneBy: {
      type: Schema4.Types.ObjectId,
      ref: "User",
      default: null
    },
    replyToMessageId: {
      type: Schema4.Types.ObjectId,
      ref: "Message",
      default: null
    },
    sequence: {
      type: Number,
      required: true,
      min: 1
    }
  },
  {
    collection: "messages",
    timestamps: true,
    versionKey: false
  }
);
messageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });
messageSchema.index({ senderId: 1, clientMessageId: 1 }, { unique: true });
messageSchema.index({ conversationId: 1, sequence: 1 }, { unique: true });
messageSchema.index({ "media.storageKey": 1 }, { sparse: true });
var MessageModel = model4("Message", messageSchema);

// apps/api/src/modules/messages/message-user-state.model.ts
import { model as model5, Schema as Schema5 } from "mongoose";
var messageUserStateSchema = new Schema5(
  {
    messageId: {
      type: Schema5.Types.ObjectId,
      ref: "Message",
      required: true
    },
    conversationId: {
      type: Schema5.Types.ObjectId,
      ref: "Conversation",
      required: true
    },
    userId: { type: Schema5.Types.ObjectId, ref: "User", required: true },
    hidden: { type: Boolean, default: false },
    favorite: { type: Boolean, default: false },
    pinned: { type: Boolean, default: false }
  },
  { collection: "message_user_states", timestamps: true, versionKey: false }
);
messageUserStateSchema.index({ messageId: 1, userId: 1 }, { unique: true });
messageUserStateSchema.index({ conversationId: 1, userId: 1, hidden: 1 });
messageUserStateSchema.index({ userId: 1, favorite: 1, updatedAt: -1 });
messageUserStateSchema.index({ userId: 1, pinned: 1, updatedAt: -1 });
var MessageUserStateModel = model5(
  "MessageUserState",
  messageUserStateSchema
);

// apps/api/src/modules/conversations/conversation.model.ts
import { model as model6, Schema as Schema6 } from "mongoose";
var participantSchema = new Schema6(
  {
    userId: {
      type: Schema6.Types.ObjectId,
      ref: "User",
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    lastDeliveredMessageId: {
      type: Schema6.Types.ObjectId,
      ref: "Message",
      default: null
    },
    lastDeliveredSequence: {
      type: Number,
      default: 0,
      min: 0
    },
    lastDeliveredAt: {
      type: Date,
      default: null
    },
    lastReadMessageId: {
      type: Schema6.Types.ObjectId,
      ref: "Message",
      default: null
    },
    lastReadSequence: {
      type: Number,
      default: 0,
      min: 0
    },
    lastReadAt: {
      type: Date,
      default: null
    },
    unreadCount: {
      type: Number,
      default: 0,
      min: 0
    },
    mutedUntil: { type: Date, default: null },
    muted: { type: Boolean, default: false },
    manualUnread: { type: Boolean, default: false },
    clearedAt: { type: Date, default: null }
  },
  { _id: false }
);
var conversationSchema = new Schema6(
  {
    type: {
      type: String,
      enum: ["direct"],
      default: "direct",
      required: true
    },
    directKey: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    participants: {
      type: [participantSchema],
      required: true,
      validate: {
        validator: (participants) => participants.length === 2,
        message: "A direct conversation must have two participants."
      }
    },
    messageSequence: {
      type: Number,
      default: 0,
      min: 0
    },
    lastMessageId: {
      type: Schema6.Types.ObjectId,
      ref: "Message",
      default: null
    },
    lastMessageAt: {
      type: Date,
      default: null
    }
  },
  {
    collection: "conversations",
    timestamps: true,
    versionKey: false
  }
);
conversationSchema.index({ "participants.userId": 1, lastMessageAt: -1 });
var ConversationModel = model6(
  "Conversation",
  conversationSchema
);

// apps/api/src/modules/privacy/block.service.ts
import { Types as Types4 } from "mongoose";

// apps/api/src/modules/privacy/block.model.ts
import { model as model7, Schema as Schema7 } from "mongoose";
var blockSchema = new Schema7(
  {
    blockerId: { type: Schema7.Types.ObjectId, ref: "User", required: true },
    blockedUserId: { type: Schema7.Types.ObjectId, ref: "User", required: true }
  },
  { collection: "user_blocks", timestamps: true, versionKey: false }
);
blockSchema.index({ blockerId: 1, blockedUserId: 1 }, { unique: true });
blockSchema.index({ blockedUserId: 1 });
var UserBlockModel = model7("UserBlock", blockSchema);

// apps/api/src/modules/privacy/block.service.ts
function interactionBlocked() {
  return new AppError({
    code: "INTERACTION_BLOCKED",
    message: "This interaction is unavailable.",
    statusCode: 403
  });
}
async function isUserBlockedEitherDirection(firstUserId, secondUserId) {
  if (!Types4.ObjectId.isValid(firstUserId) || !Types4.ObjectId.isValid(secondUserId)) {
    return false;
  }
  return await UserBlockModel.exists({
    $or: [
      { blockerId: firstUserId, blockedUserId: secondUserId },
      { blockerId: secondUserId, blockedUserId: firstUserId }
    ]
  }).exec() !== null;
}
async function assertUsersCanInteract(firstUserId, secondUserId) {
  if (await isUserBlockedEitherDirection(firstUserId, secondUserId)) {
    throw interactionBlocked();
  }
}
async function initializeBlockModels() {
  await UserBlockModel.init();
}

// apps/api/src/modules/conversations/conversation.service.ts
function directConversationKey(firstUserId, secondUserId) {
  return [firstUserId, secondUserId].sort().join(":");
}
async function initializeConversationModels() {
  await ConversationModel.init();
}

// apps/api/src/modules/notifications/notification.service.ts
import { Types as Types6 } from "mongoose";

// apps/api/src/modules/notifications/push-device.model.ts
import { model as model8, Schema as Schema8 } from "mongoose";
var pushDeviceSchema = new Schema8(
  {
    userId: { type: Schema8.Types.ObjectId, ref: "User", required: true },
    pushToken: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      maxlength: 512
    },
    platform: { type: String, enum: [...pushPlatforms], required: true },
    deviceId: { type: String, default: null, trim: true, maxlength: 128 },
    enabled: { type: Boolean, default: true }
  },
  { collection: "push_devices", timestamps: true, versionKey: false }
);
pushDeviceSchema.index({ userId: 1, enabled: 1 });
var PushDeviceModel = model8(
  "PushDevice",
  pushDeviceSchema
);

// apps/api/src/modules/notifications/notification.service.ts
function objectId(value) {
  return new Types6.ObjectId(value);
}
async function disablePushTokens(pushTokens) {
  if (pushTokens.length === 0) return;
  await PushDeviceModel.updateMany(
    { pushToken: { $in: pushTokens } },
    { $set: { enabled: false } }
  ).exec();
}
async function getEnabledPushDevices(userId) {
  return PushDeviceModel.find({
    userId: objectId(userId),
    enabled: true
  }).exec();
}
async function initializeNotificationModels() {
  await PushDeviceModel.init();
}

// apps/api/src/modules/notifications/push.service.ts
var pushDeduplicationTtlSeconds = 86400;
var expoBatchSize = 100;
var expoRequestTimeoutMs = 1e4;
var expoReceiptDelayMs = 15e3;
function isRecord2(value) {
  return typeof value === "object" && value !== null;
}
function buildMissedCallPushPayload(token, call, caller) {
  const callType = call.type;
  return {
    to: token,
    title: `Missed ${callType} call`,
    body: caller.displayName,
    data: {
      type: "missed_call",
      callId: call._id.toString(),
      callerId: call.callerId.toString(),
      callType
    },
    sound: "default",
    priority: "high",
    channelId: "calls"
  };
}
function pushErrorCode(value) {
  if (!isRecord2(value) || value.status !== "error") return null;
  const details = isRecord2(value.details) ? value.details : void 0;
  return typeof details?.error === "string" ? details.error : null;
}
function pushErrorCodesFromResponse(response) {
  if (!isRecord2(response) || !Array.isArray(response.data)) return [];
  return [
    ...new Set(
      response.data.map((ticket) => pushErrorCode(ticket)).filter((code) => code !== null)
    )
  ];
}
function pushTicketSummary(response) {
  if (!isRecord2(response) || !Array.isArray(response.data)) {
    return {
      ticketCount: 0,
      okTicketCount: 0,
      ticketIdCount: 0,
      errorCodes: []
    };
  }
  return {
    ticketCount: response.data.length,
    okTicketCount: response.data.filter(
      (ticket) => isRecord2(ticket) && ticket.status === "ok"
    ).length,
    ticketIdCount: response.data.filter(
      (ticket) => isRecord2(ticket) && typeof ticket.id === "string"
    ).length,
    errorCodes: pushErrorCodesFromResponse(response)
  };
}
function pushReceiptSummary(response) {
  if (!isRecord2(response) || !isRecord2(response.data)) {
    return {
      receiptCount: 0,
      okReceiptCount: 0,
      errorReceiptCount: 0,
      errorCodes: []
    };
  }
  const receipts = Object.values(response.data);
  return {
    receiptCount: receipts.length,
    okReceiptCount: receipts.filter(
      (receipt) => isRecord2(receipt) && receipt.status === "ok"
    ).length,
    errorReceiptCount: receipts.filter(
      (receipt) => isRecord2(receipt) && receipt.status === "error"
    ).length,
    errorCodes: pushReceiptErrorCodesFromResponse(response)
  };
}
function emptyPushTicketSummary() {
  return {
    ticketCount: 0,
    okTicketCount: 0,
    ticketIdCount: 0,
    errorCodes: []
  };
}
function emptyPushReceiptSummary() {
  return {
    receiptCount: 0,
    okReceiptCount: 0,
    errorReceiptCount: 0,
    errorCodes: []
  };
}
function buildIncomingCallPushPayload(token, call, caller) {
  const callType = call.type;
  return {
    to: token,
    title: `Incoming ${callType} call`,
    body: `${caller.displayName} is calling you`,
    data: {
      type: "incoming_call",
      callId: call._id.toString(),
      callerId: call.callerId.toString(),
      callType
    },
    sound: "default",
    priority: "high",
    channelId: "calls"
  };
}
function invalidPushTokensFromResponse(tokens, response) {
  if (!isRecord2(response) || !Array.isArray(response.data)) return [];
  return response.data.flatMap((ticket, index) => {
    return pushErrorCode(ticket) === "DeviceNotRegistered" && tokens[index] !== void 0 ? [tokens[index]] : [];
  });
}
function ticketTokenPairsFromResponse(tokens, response) {
  if (!isRecord2(response) || !Array.isArray(response.data)) return [];
  return response.data.flatMap((ticket, index) => {
    if (!isRecord2(ticket) || typeof ticket.id !== "string") return [];
    const token = tokens[index];
    if (token === void 0 || ticket.status !== "ok") return [];
    const parsedTicket = {
      status: "ok",
      id: ticket.id
    };
    return parsedTicket.id === void 0 ? [] : [{ id: parsedTicket.id, token }];
  });
}
function invalidPushTokensFromReceiptResponse(ticketTokens, response) {
  if (!isRecord2(response) || !isRecord2(response.data)) return [];
  return Object.entries(response.data).flatMap(([ticketId, receipt]) => {
    const token = ticketTokens.get(ticketId);
    return pushErrorCode(receipt) === "DeviceNotRegistered" && token !== void 0 ? [token] : [];
  });
}
function pushReceiptErrorCodesFromResponse(response) {
  if (!isRecord2(response) || !isRecord2(response.data)) return [];
  return [
    ...new Set(
      Object.values(response.data).map((receipt) => pushErrorCode(receipt)).filter((code) => code !== null)
    )
  ];
}
async function claimPush(key) {
  if (!redisClient.isReady) return true;
  const result = await redisClient.set(key, "1", {
    NX: true,
    EX: pushDeduplicationTtlSeconds
  });
  return result === "OK";
}
async function releasePushClaim(key) {
  if (redisClient.isReady) await redisClient.del(key);
}
async function runPushOnce(key, operation) {
  if (!await claimPush(key)) return false;
  try {
    await operation();
    return true;
  } catch (error) {
    await releasePushClaim(key).catch(() => void 0);
    throw error;
  }
}
function pushHeaders() {
  const headers = {
    "Content-Type": "application/json"
  };
  if (env.EXPO_ACCESS_TOKEN !== void 0) {
    headers.Authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`;
  }
  return headers;
}
async function responseBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
async function processExpoReceipts(ticketTokens) {
  if (ticketTokens.length === 0) {
    return { status: "error", summary: emptyPushReceiptSummary() };
  }
  try {
    const response = await fetch(env.EXPO_PUSH_RECEIPTS_URL, {
      method: "POST",
      headers: pushHeaders(),
      body: JSON.stringify({ ids: ticketTokens.map((ticket) => ticket.id) }),
      signal: AbortSignal.timeout(expoRequestTimeoutMs)
    });
    const body = await responseBody(response);
    const summary = pushReceiptSummary(body);
    logger.info(
      {
        event: "push.expo_receipt_response",
        httpStatus: response.status,
        requestAccepted: response.ok,
        ...summary
      },
      "Expo push receipt response"
    );
    if (!response.ok) {
      logger.warn(
        { statusCode: response.status },
        "Expo push receipt request failed"
      );
      return { status: "error", summary };
    }
    const ticketMap = new Map(
      ticketTokens.map((ticket) => [ticket.id, ticket.token])
    );
    await disablePushTokens(
      invalidPushTokensFromReceiptResponse(ticketMap, body)
    );
    const errorCodes = pushReceiptErrorCodesFromResponse(body);
    if (errorCodes.length > 0) {
      logger.warn(
        { errorCodes },
        "Expo push receipts reported delivery errors"
      );
    }
    const completeSuccess = summary.receiptCount === ticketTokens.length && summary.okReceiptCount === summary.receiptCount;
    return { status: completeSuccess ? "ok" : "error", summary };
  } catch (error) {
    logger.warn({ err: error }, "Expo push receipt processing failed");
    return { status: "error", summary: emptyPushReceiptSummary() };
  }
}
function scheduleExpoReceiptCheck(ticketTokens) {
  if (ticketTokens.length === 0) return;
  const timer = setTimeout(() => {
    void processExpoReceipts(ticketTokens);
  }, expoReceiptDelayMs);
  timer.unref();
}
async function sendExpoBatch(messages, options = {}) {
  if (messages.length === 0) {
    return { ticketSummary: emptyPushTicketSummary(), receipt: null };
  }
  const response = await fetch(env.EXPO_PUSH_API_URL, {
    method: "POST",
    headers: pushHeaders(),
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(expoRequestTimeoutMs)
  });
  const body = await responseBody(response);
  const summary = pushTicketSummary(body);
  logger.info(
    {
      event: "push.expo_ticket_response",
      httpStatus: response.status,
      requestAccepted: response.ok,
      attemptedDeviceCount: messages.length,
      ...summary
    },
    "Expo push ticket response"
  );
  if (!response.ok) {
    throw new Error(`Expo push service returned HTTP ${response.status}.`);
  }
  const tokens = deviceTokensFromMessages(messages);
  await disablePushTokens(invalidPushTokensFromResponse(tokens, body));
  const errorCodes = pushErrorCodesFromResponse(body);
  if (errorCodes.length > 0) {
    logger.warn({ errorCodes }, "Expo push tickets reported delivery errors");
  }
  const ticketTokens = ticketTokenPairsFromResponse(tokens, body);
  if (options.waitForReceipt === true) {
    await new Promise((resolve) => {
      setTimeout(resolve, options.receiptDelayMs ?? expoReceiptDelayMs);
    });
    return {
      ticketSummary: summary,
      receipt: await processExpoReceipts(ticketTokens)
    };
  }
  scheduleExpoReceiptCheck(ticketTokens);
  return { ticketSummary: summary, receipt: null };
}
function deviceTokensFromMessages(messages) {
  return messages.map((message) => message.to);
}
async function sendPushMessages(messages) {
  for (let index = 0; index < messages.length; index += expoBatchSize) {
    await sendExpoBatch(messages.slice(index, index + expoBatchSize));
  }
}
async function dispatchIncomingCallNotification(call, caller) {
  const deduplicationKey = `terqivo:push:call:${call._id.toString()}`;
  try {
    const dedupAccepted = await runPushOnce(deduplicationKey, async () => {
      if (await isUserBlockedEitherDirection(
        call.callerId.toString(),
        call.calleeId.toString()
      )) {
        return;
      }
      const devices = await getEnabledPushDevices(call.calleeId.toString());
      logger.info(
        {
          event: "push.incoming_call_requested",
          callId: call._id.toString(),
          recipientId: call.calleeId.toString(),
          activeDeviceCount: devices.length,
          dedupAccepted: true
        },
        "Incoming call push requested"
      );
      await sendPushMessages(
        devices.map(
          (device) => buildIncomingCallPushPayload(device.pushToken, call, caller)
        )
      );
    });
    if (!dedupAccepted) {
      logger.info(
        { event: "push.incoming_call_skipped", dedupAccepted: false },
        "Incoming call push skipped as duplicate"
      );
    }
  } catch (error) {
    logger.warn({ err: error }, "Incoming call push delivery failed");
  }
}
async function dispatchMissedCallNotification(call) {
  const deduplicationKey = `terqivo:push:missed-call:${call._id.toString()}`;
  try {
    const dedupAccepted = await runPushOnce(deduplicationKey, async () => {
      if (await isUserBlockedEitherDirection(
        call.callerId.toString(),
        call.calleeId.toString()
      )) {
        return;
      }
      const [devices, caller] = await Promise.all([
        getEnabledPushDevices(call.calleeId.toString()),
        getUserById(call.callerId.toString())
      ]);
      logger.info(
        {
          event: "push.missed_call_requested",
          callId: call._id.toString(),
          recipientId: call.calleeId.toString(),
          activeDeviceCount: devices.length,
          dedupAccepted: true
        },
        "Missed call push requested"
      );
      if (caller === null) return;
      await sendPushMessages(
        devices.map(
          (device) => buildMissedCallPushPayload(device.pushToken, call, caller)
        )
      );
    });
    if (!dedupAccepted) {
      logger.info(
        { event: "push.missed_call_skipped", dedupAccepted: false },
        "Missed call push skipped as duplicate"
      );
    }
  } catch (error) {
    logger.warn({ err: error }, "Missed call push delivery failed");
  }
}

// apps/api/src/sockets/socket-auth.ts
function accessTokenFromSocket(socket) {
  const auth = socket.handshake.auth;
  if (isRecord(auth) && typeof auth.token === "string" && auth.token.length > 0) {
    return auth.token;
  }
  const authorization = socket.handshake.headers.authorization;
  if (typeof authorization !== "string") {
    return null;
  }
  const parts = authorization.trim().split(/\s+/);
  return parts.length === 2 && parts[0]?.toLowerCase() === "bearer" ? parts[1] ?? null : null;
}
async function authenticateSocket(socket) {
  const token = accessTokenFromSocket(socket);
  if (token === null) {
    throw new Error("Socket authentication failed");
  }
  const claims = await verifyAccessToken(token);
  const [user, session] = await Promise.all([
    getUserById(claims.sub),
    getActiveSession(claims.sub, claims.sid)
  ]);
  if (user === null || session === null || user.accountStatus !== "active") {
    throw new Error("Socket authentication failed");
  }
  return { userId: claims.sub, sessionId: claims.sid };
}
function installSocketAuthentication(socketServer) {
  socketServer.use((socket, next) => {
    void authenticateSocket(socket).then((context) => {
      socket.data.auth = context;
      next();
    }).catch(() => next(new Error("Socket authentication failed")));
  });
}

// Servers/callserver/server.ts
var callSchema = new Schema9(
  {
    callerId: { type: Schema9.Types.ObjectId, ref: "User", required: true },
    calleeId: { type: Schema9.Types.ObjectId, ref: "User", required: true },
    conversationId: {
      type: Schema9.Types.ObjectId,
      ref: "Conversation",
      default: null
    },
    type: { type: String, enum: [...callTypes], required: true },
    status: { type: String, enum: [...callStatuses], required: true },
    initiatedAt: { type: Date, required: true },
    answeredAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    durationSeconds: { type: Number, default: null, min: 0 },
    endedBy: { type: Schema9.Types.ObjectId, ref: "User", default: null },
    endReason: { type: String, enum: [...callEndReasons], default: null },
    callerSessionId: { type: String, required: true, maxlength: 128 },
    acceptedBySessionId: { type: String, default: null, maxlength: 128 }
  },
  { collection: "calls", timestamps: true, versionKey: false }
);
callSchema.index({ callerId: 1, initiatedAt: -1, _id: -1 });
callSchema.index({ calleeId: 1, initiatedAt: -1, _id: -1 });
callSchema.index({ status: 1, initiatedAt: 1 });
var CallModel = model9("Call", callSchema);
var iceServerSchema = z3.object({
  urls: z3.union([
    z3.string().trim().min(1),
    z3.array(z3.string().trim().min(1)).min(1)
  ]),
  username: z3.string().min(1).optional(),
  credential: z3.string().min(1).optional()
});
var parsedIceServers;
try {
  parsedIceServers = JSON.parse(env.ICE_SERVERS);
} catch {
  throw new Error("Invalid ICE_SERVERS configuration: expected JSON.");
}
var parsedIceServerConfig = z3.array(iceServerSchema).min(1).safeParse(parsedIceServers);
if (!parsedIceServerConfig.success) {
  throw new Error(
    "Invalid ICE_SERVERS configuration: expected ICE server objects."
  );
}
var iceServers = parsedIceServerConfig.data;
var objectIdSchema = z3.string().trim().refine(Types7.ObjectId.isValid, "Invalid identifier");
var callStartSchema = z3.object({
  calleeId: objectIdSchema,
  type: z3.enum(callTypes)
});
var callIdParamsSchema = z3.object({ callId: objectIdSchema });
var callHistoryQuerySchema = z3.object({
  cursor: z3.string().trim().min(1).optional(),
  limit: z3.coerce.number().int().min(1).max(50).default(20)
});
var webrtcDescriptionSchema = z3.object({
  callId: objectIdSchema,
  description: z3.object({
    type: z3.enum(["offer", "answer"]),
    sdp: z3.string().min(1).max(1e5)
  })
});
var webrtcIceCandidateSchema = z3.object({
  callId: objectIdSchema,
  candidate: z3.object({
    candidate: z3.string().min(1).max(4096),
    sdpMid: z3.string().max(256).nullable(),
    sdpMLineIndex: z3.number().int().min(0).max(100).nullable()
  })
});
function toCallUserDto(user) {
  return {
    id: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    badges: user.badges ?? []
  };
}
function toCallSignalDto(call) {
  return {
    id: call._id.toString(),
    type: call.type,
    callerId: call.callerId.toString(),
    calleeId: call.calleeId.toString(),
    status: call.status,
    initiatedAt: call.initiatedAt.toISOString(),
    answeredAt: call.answeredAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null
  };
}
function toCallDto(call, currentUserId, otherUser) {
  return {
    id: call._id.toString(),
    type: call.type,
    direction: call.callerId.toString() === currentUserId ? "outgoing" : "incoming",
    otherUser: toCallUserDto(otherUser),
    status: call.status,
    initiatedAt: call.initiatedAt.toISOString(),
    answeredAt: call.answeredAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    durationSeconds: call.durationSeconds,
    endReason: call.endReason
  };
}
var activeCallStatuses = ["ringing", "accepted"];
var terminalCallStatuses = [
  "declined",
  "missed",
  "ended",
  "cancelled",
  "failed"
];
var activeCallKeyPrefix = "terqivo:active-call:user:";
var callRateWindowSeconds = 15 * 60;
function callNotFound() {
  return new AppError({
    code: "CALL_NOT_FOUND",
    message: "The call was not found.",
    statusCode: 404
  });
}
function invalidTransition() {
  return new AppError({
    code: "CALL_INVALID_STATE",
    message: "That call action is not valid in the current state.",
    statusCode: 409
  });
}
function callBusy() {
  return new AppError({
    code: "CALL_BUSY",
    message: "One of the users is already in an active call.",
    statusCode: 409
  });
}
function targetUnavailable() {
  return new AppError({
    code: "CALL_TARGET_UNAVAILABLE",
    message: "The call target is unavailable.",
    statusCode: 404
  });
}
function callForbidden() {
  return new AppError({
    code: "CALL_FORBIDDEN",
    message: "You are not a participant in this call.",
    statusCode: 403
  });
}
function signalingUnavailable() {
  return new AppError({
    code: "CALL_SIGNALING_UNAVAILABLE",
    message: "Signaling is only available for an active call.",
    statusCode: 409
  });
}
function objectId2(value) {
  return new Types7.ObjectId(value);
}
function activeCallKey(userId) {
  return `${activeCallKeyPrefix}${userId}`;
}
async function releaseActiveCallKey(userId, callId) {
  const key = activeCallKey(userId);
  if (await redisClient.get(key) === callId) {
    await redisClient.del(key);
  }
}
async function releaseActiveCallKeys(call) {
  await Promise.all([
    releaseActiveCallKey(call.callerId.toString(), call._id.toString()),
    releaseActiveCallKey(call.calleeId.toString(), call._id.toString())
  ]);
}
async function reserveActiveCallKey(userId, callId) {
  const key = activeCallKey(userId);
  const existingCallId = await redisClient.get(key);
  if (existingCallId !== null && existingCallId !== callId) {
    const existingCall = await CallModel.findById(existingCallId).select({ status: 1 }).exec();
    if (existingCall === null || terminalCallStatuses.includes(existingCall.status)) {
      await redisClient.del(key);
    }
  }
  const result = await redisClient.set(key, callId, {
    NX: true,
    EX: env.CALL_ACTIVE_TTL_SECONDS
  });
  return result === "OK";
}
async function enforceCallRateLimit(userId) {
  const window = Math.floor(Date.now() / (callRateWindowSeconds * 1e3));
  const key = `terqivo:call-rate:${userId}:${window}`;
  const count = await redisClient.incr(key);
  if (count === 1) {
    await redisClient.expire(key, callRateWindowSeconds);
  }
  if (count > env.CALL_START_RATE_LIMIT_MAX) {
    throw new AppError({
      code: "CALL_RATE_LIMITED",
      message: "Too many call attempts. Please try again later.",
      statusCode: 429
    });
  }
}
async function getOwnedCall(context, callId) {
  if (!Types7.ObjectId.isValid(callId)) {
    throw callNotFound();
  }
  const call = await CallModel.findOne({
    _id: objectId2(callId),
    $or: [
      { callerId: objectId2(context.userId) },
      { calleeId: objectId2(context.userId) }
    ]
  }).exec();
  if (call === null) {
    throw callNotFound();
  }
  return call;
}
function setEndedFields(call, endedAt, endedBy, reason) {
  call.endedAt = endedAt;
  call.endedBy = endedBy;
  call.endReason = reason;
  call.durationSeconds = call.answeredAt === null ? 0 : Math.max(
    0,
    Math.floor((endedAt.getTime() - call.answeredAt.getTime()) / 1e3)
  );
}
async function saveTransition(call, expectedStatus, changes) {
  if (call.status !== expectedStatus) {
    throw invalidTransition();
  }
  const saved = await CallModel.findOneAndUpdate(
    { _id: call._id, status: expectedStatus },
    { $set: changes },
    { returnDocument: "after" }
  ).exec();
  if (saved === null) {
    throw invalidTransition();
  }
  return { call: saved, changed: true };
}
async function startCall(context, input) {
  if (context.userId === input.calleeId) {
    throw new AppError({
      code: "CANNOT_CALL_SELF",
      message: "You cannot call yourself.",
      statusCode: 400
    });
  }
  await enforceCallRateLimit(context.userId);
  const [caller, callee] = await Promise.all([
    getUserById(context.userId),
    getUserById(input.calleeId)
  ]);
  if (caller === null || caller.accountStatus !== "active") {
    throw targetUnavailable();
  }
  if (callee === null || callee.accountStatus !== "active") {
    throw targetUnavailable();
  }
  await assertUsersCanInteract(context.userId, input.calleeId);
  const existing = await CallModel.findOne({
    $or: [
      ...activeCallStatuses.map((status) => ({
        callerId: objectId2(context.userId),
        status
      })),
      ...activeCallStatuses.map((status) => ({
        calleeId: objectId2(context.userId),
        status
      })),
      ...activeCallStatuses.map((status) => ({
        callerId: objectId2(input.calleeId),
        status
      })),
      ...activeCallStatuses.map((status) => ({
        calleeId: objectId2(input.calleeId),
        status
      }))
    ]
  }).exec();
  if (existing !== null) {
    throw callBusy();
  }
  const callId = new Types7.ObjectId();
  const callerSlot = await reserveActiveCallKey(
    context.userId,
    callId.toString()
  );
  if (!callerSlot) {
    throw callBusy();
  }
  const calleeSlot = await reserveActiveCallKey(
    input.calleeId,
    callId.toString()
  );
  if (!calleeSlot) {
    await releaseActiveCallKey(context.userId, callId.toString());
    throw callBusy();
  }
  try {
    const conversation = await ConversationModel.findOne({
      directKey: directConversationKey(context.userId, input.calleeId)
    }).select({ _id: 1 }).exec();
    const now = /* @__PURE__ */ new Date();
    const call = await CallModel.create({
      _id: callId,
      callerId: objectId2(context.userId),
      calleeId: objectId2(input.calleeId),
      conversationId: conversation?._id ?? null,
      type: input.type,
      status: "ringing",
      initiatedAt: now,
      answeredAt: null,
      endedAt: null,
      durationSeconds: null,
      endedBy: null,
      endReason: null,
      callerSessionId: context.sessionId,
      acceptedBySessionId: null
    });
    return { call, caller, changed: true };
  } catch (error) {
    await Promise.all([
      releaseActiveCallKey(context.userId, callId.toString()),
      releaseActiveCallKey(input.calleeId, callId.toString())
    ]);
    throw error;
  }
}
async function acceptCall(context, callId) {
  const call = await getOwnedCall(context, callId);
  if (call.calleeId.toString() !== context.userId) {
    throw callForbidden();
  }
  await assertUsersCanInteract(call.callerId.toString(), call.calleeId.toString());
  if (call.status === "accepted") {
    return { call, changed: false };
  }
  return saveTransition(call, "ringing", {
    status: "accepted",
    answeredAt: /* @__PURE__ */ new Date(),
    acceptedBySessionId: context.sessionId
  });
}
async function declineCall(context, callId) {
  const call = await getOwnedCall(context, callId);
  if (call.calleeId.toString() !== context.userId) {
    throw callForbidden();
  }
  if (call.status === "declined") {
    return { call, changed: false };
  }
  const result = await saveTransition(call, "ringing", {
    status: "declined",
    endedAt: /* @__PURE__ */ new Date(),
    endReason: "declined",
    durationSeconds: 0
  });
  await releaseActiveCallKeys(result.call);
  return result;
}
async function cancelCall(context, callId) {
  const call = await getOwnedCall(context, callId);
  if (call.callerId.toString() !== context.userId) {
    throw callForbidden();
  }
  if (call.status === "cancelled") {
    return { call, changed: false };
  }
  const result = await saveTransition(call, "ringing", {
    status: "cancelled",
    endedAt: /* @__PURE__ */ new Date(),
    endReason: "cancelled",
    durationSeconds: 0
  });
  await releaseActiveCallKeys(result.call);
  return result;
}
async function endCall(context, callId) {
  const call = await getOwnedCall(context, callId);
  if (["ended", "failed", "declined", "cancelled", "missed"].includes(call.status)) {
    return { call, changed: false };
  }
  if (call.status !== "accepted") {
    throw invalidTransition();
  }
  const endedAt = /* @__PURE__ */ new Date();
  setEndedFields(call, endedAt, objectId2(context.userId), "local-ended");
  const result = await saveTransition(call, "accepted", {
    status: "ended",
    endedAt,
    endedBy: objectId2(context.userId),
    endReason: "local-ended",
    durationSeconds: call.durationSeconds
  });
  await releaseActiveCallKeys(result.call);
  return result;
}
async function failCall(context, callId) {
  const call = await getOwnedCall(context, callId);
  if (call.status === "failed") {
    return { call, changed: false };
  }
  if (call.status !== "accepted") {
    throw invalidTransition();
  }
  const endedAt = /* @__PURE__ */ new Date();
  setEndedFields(call, endedAt, objectId2(context.userId), "connection-failed");
  const result = await saveTransition(call, "accepted", {
    status: "failed",
    endedAt,
    endedBy: objectId2(context.userId),
    endReason: "connection-failed",
    durationSeconds: call.durationSeconds
  });
  await releaseActiveCallKeys(result.call);
  return result;
}
async function markCallMissed(callId) {
  if (!Types7.ObjectId.isValid(callId)) {
    return null;
  }
  const call = await CallModel.findOneAndUpdate(
    { _id: objectId2(callId), status: "ringing" },
    {
      $set: {
        status: "missed",
        endedAt: /* @__PURE__ */ new Date(),
        durationSeconds: 0,
        endReason: "timeout"
      }
    },
    { returnDocument: "after" }
  ).exec();
  if (call !== null) {
    await releaseActiveCallKeys(call);
  }
  return call;
}
async function cancelCallsForSession(sessionId) {
  const ringing = await CallModel.find({
    status: "ringing",
    callerSessionId: sessionId
  }).exec();
  const accepted = await CallModel.find({
    status: "accepted",
    $or: [{ callerSessionId: sessionId }, { acceptedBySessionId: sessionId }]
  }).exec();
  const affected = [];
  for (const call of ringing) {
    const updated = await CallModel.findOneAndUpdate(
      { _id: call._id, status: "ringing", callerSessionId: sessionId },
      {
        $set: {
          status: "cancelled",
          endedAt: /* @__PURE__ */ new Date(),
          durationSeconds: 0,
          endReason: "cancelled"
        }
      },
      { returnDocument: "after" }
    ).exec();
    if (updated !== null) {
      await releaseActiveCallKeys(updated);
      affected.push(updated);
    }
  }
  for (const call of accepted) {
    const updated = await CallModel.findOneAndUpdate(
      {
        _id: call._id,
        status: "accepted",
        $or: [
          { callerSessionId: sessionId },
          { acceptedBySessionId: sessionId }
        ]
      },
      {
        $set: {
          status: "failed",
          endedAt: /* @__PURE__ */ new Date(),
          endedBy: call.callerSessionId === sessionId ? call.callerId : call.calleeId,
          durationSeconds: call.answeredAt === null ? 0 : Math.max(
            0,
            Math.floor((Date.now() - call.answeredAt.getTime()) / 1e3)
          ),
          endReason: "connection-failed"
        }
      },
      { returnDocument: "after" }
    ).exec();
    if (updated !== null) {
      await releaseActiveCallKeys(updated);
      affected.push(updated);
    }
  }
  return affected;
}
async function assertSignalingAllowed(context, callId) {
  const call = await getOwnedCall(context, callId);
  if (call.status !== "accepted") {
    throw signalingUnavailable();
  }
  await assertUsersCanInteract(call.callerId.toString(), call.calleeId.toString());
  const otherUserId = call.callerId.toString() === context.userId ? call.calleeId.toString() : call.callerId.toString();
  return { call, otherUserId };
}
function callSignal(call) {
  return toCallSignalDto(call);
}
async function listCallHistory(context, query) {
  const userId = objectId2(context.userId);
  const filter = {
    $or: [{ callerId: userId }, { calleeId: userId }]
  };
  const cursor = decodeCursor(query.cursor);
  if (cursor !== null) {
    const initiatedAt = new Date(cursor.createdAt);
    if (Number.isNaN(initiatedAt.getTime()) || !Types7.ObjectId.isValid(cursor.id)) {
      throw new AppError({
        code: "INVALID_CURSOR",
        message: "The pagination cursor is invalid.",
        statusCode: 400
      });
    }
    filter.$and = [
      {
        $or: [
          { initiatedAt: { $lt: initiatedAt } },
          { initiatedAt, _id: { $lt: objectId2(cursor.id) } }
        ]
      }
    ];
  }
  const records = await CallModel.find(filter).sort({ initiatedAt: -1, _id: -1 }).limit(query.limit + 1).exec();
  const hasNext = records.length > query.limit;
  const page = hasNext ? records.slice(0, query.limit) : records;
  const otherIds = page.map(
    (call) => call.callerId.equals(userId) ? call.calleeId : call.callerId
  );
  const users = await UserModel.find({ _id: { $in: otherIds } }).exec();
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));
  const calls2 = page.flatMap((call) => {
    const otherId = call.callerId.equals(userId) ? call.calleeId : call.callerId;
    const otherUser = usersById.get(otherId.toString());
    return otherUser === void 0 ? [] : [toCallDto(call, context.userId, otherUser)];
  });
  const last = page.at(-1);
  return {
    calls: calls2,
    nextCursor: hasNext && last !== void 0 ? encodeCursor({
      createdAt: last.initiatedAt.toISOString(),
      id: last._id.toString()
    }) : null
  };
}
async function getCallDetails(context, callId) {
  const call = await getOwnedCall(context, callId);
  const otherId = call.callerId.toString() === context.userId ? call.calleeId.toString() : call.callerId.toString();
  const otherUser = await getUserById(otherId);
  if (otherUser === null) {
    throw callNotFound();
  }
  return toCallDto(call, context.userId, otherUser);
}
async function initializeCallModels() {
  if (iceServers.length === 0) {
    throw new Error("At least one ICE server must be configured.");
  }
  await CallModel.init();
}
var timeoutSetKey = "terqivo:call-timeouts";
var timeoutLockPrefix = "terqivo:call-timeout-lock:";
var pollIntervalMs = 5e3;
async function scheduleCallTimeout(callId, initiatedAt) {
  await redisClient.zAdd(timeoutSetKey, {
    score: initiatedAt.getTime() + env.CALL_RING_TIMEOUT_SECONDS * 1e3,
    value: callId
  });
}
async function removeCallTimeout(callId) {
  await redisClient.zRem(timeoutSetKey, callId);
}
async function recoverCallTimeouts() {
  const ringingCalls = await CallModel.find({ status: "ringing" }).select({ _id: 1, initiatedAt: 1 }).exec();
  for (const call of ringingCalls) {
    await scheduleCallTimeout(call._id.toString(), call.initiatedAt);
  }
}
async function processExpiredCallTimeouts(onMissed) {
  const expiredIds = await redisClient.zRangeByScore(
    timeoutSetKey,
    0,
    Date.now()
  );
  for (const callId of expiredIds) {
    const lock = await redisClient.set(`${timeoutLockPrefix}${callId}`, "1", {
      NX: true,
      EX: 10
    });
    if (lock !== "OK") {
      continue;
    }
    const missedCall = await markCallMissed(callId);
    await redisClient.zRem(timeoutSetKey, callId);
    if (missedCall !== null) {
      await onMissed(missedCall);
    }
  }
}
function startCallTimeoutCoordinator(onMissed) {
  let stopped = false;
  const process2 = () => {
    if (stopped) {
      return;
    }
    void processExpiredCallTimeouts(onMissed).catch((error) => {
      logger.error({ err: error }, "Call timeout reconciliation failed");
    });
  };
  const interval = setInterval(process2, pollIntervalMs);
  process2();
  return {
    stop: () => {
      stopped = true;
      clearInterval(interval);
    }
  };
}
function removeCallTimeoutSafely(callId) {
  void removeCallTimeout(callId).catch((error) => {
    logger.warn({ callId, err: error }, "Call timeout cleanup deferred");
  });
}
function controller(handler) {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}
var callRouter = Router();
callRouter.use(authenticate);
callRouter.get(
  "/",
  controller(async (request, response) => {
    const result = await listCallHistory(
      requireAuthContext(request),
      callHistoryQuerySchema.parse(request.query)
    );
    response.status(200).json({ success: true, data: result });
  })
);
callRouter.get(
  "/:callId",
  controller(async (request, response) => {
    const { callId } = callIdParamsSchema.parse(request.params);
    const call = await getCallDetails(requireAuthContext(request), callId);
    response.status(200).json({ success: true, data: { call } });
  })
);
var socketValidationError = {
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    message: "The socket event payload is invalid."
  }
};
function userRoom(userId) {
  return `user:${userId}`;
}
function contextForSocket(socket) {
  const context = socket.data.auth;
  if (context === void 0) {
    throw new Error("Socket authentication context is missing");
  }
  return context;
}
function errorResponse(error) {
  if (error instanceof AppError) {
    return {
      success: false,
      error: { code: error.code, message: error.message }
    };
  }
  return {
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred."
    }
  };
}
function acknowledge(ack, response) {
  ack?.(response);
}
function logSocketError(socket, event, error) {
  logger.warn(
    { socketId: socket.id, userId: socket.data.auth?.userId, event, err: error },
    "Call socket event failed"
  );
}
function broadcastCall(io2, event, call) {
  const payload = { call };
  io2.to(userRoom(call.callerId)).emit(event, payload);
  io2.to(userRoom(call.calleeId)).emit(event, payload);
}
function installCallEvents(io2, socket) {
  socket.on("call:start", (payload, ack) => {
    const parsed = callStartSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge(ack, socketValidationError);
      return;
    }
    void startCall(contextForSocket(socket), parsed.data).then(async (result) => {
      const call = callSignal(result.call);
      acknowledge(ack, { success: true, data: { call } });
      socket.emit("call:ringing", { call });
      const incoming = {
        call,
        caller: toCallUserDto(result.caller)
      };
      io2.to(userRoom(result.call.calleeId.toString())).emit(
        "call:incoming",
        incoming
      );
      void dispatchIncomingCallNotification(result.call, result.caller);
      await scheduleCallTimeout(
        result.call._id.toString(),
        result.call.initiatedAt
      );
    }).catch((error) => {
      logSocketError(socket, "call:start", error);
      acknowledge(ack, errorResponse(error));
    });
  });
  const transition = (event, action, broadcastEvent) => {
    socket.on(event, (payload, ack) => {
      const parsed = callIdParamsSchema.safeParse(payload);
      if (!parsed.success) {
        acknowledge(ack, socketValidationError);
        return;
      }
      void action(contextForSocket(socket), parsed.data.callId).then((result) => {
        const call = callSignal(result.call);
        acknowledge(ack, {
          success: true,
          data: { call, changed: result.changed }
        });
        if (result.changed && broadcastEvent !== null) {
          removeCallTimeoutSafely(call.id);
          broadcastCall(io2, broadcastEvent, call);
        }
      }).catch((error) => {
        logSocketError(socket, event, error);
        acknowledge(ack, errorResponse(error));
      });
    });
  };
  socket.on("call:accept", (payload, ack) => {
    const parsed = callIdParamsSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge(ack, socketValidationError);
      return;
    }
    void acceptCall(contextForSocket(socket), parsed.data.callId).then((result) => {
      const call = callSignal(result.call);
      acknowledge(ack, {
        success: true,
        data: { call, changed: result.changed }
      });
      if (!result.changed) {
        socket.emit("call:answered-elsewhere", {
          callId: call.id,
          type: call.type
        });
        return;
      }
      removeCallTimeoutSafely(call.id);
      socket.emit("call:accepted", { call });
      io2.to(userRoom(call.callerId)).emit("call:accepted", {
        call
      });
      socket.to(userRoom(call.calleeId)).emit("call:answered-elsewhere", {
        callId: call.id,
        type: call.type
      });
    }).catch((error) => {
      logSocketError(socket, "call:accept", error);
      acknowledge(ack, errorResponse(error));
    });
  });
  transition("call:decline", declineCall, "call:declined");
  transition("call:cancel", cancelCall, "call:cancelled");
  transition("call:end", endCall, "call:ended");
  transition("call:fail", failCall, "call:failed");
  const relayDescription = (payload, expectedType, event, ack) => {
    const parsed = webrtcDescriptionSchema.safeParse(payload);
    if (!parsed.success || parsed.data.description.type !== expectedType) {
      acknowledge(ack, socketValidationError);
      return;
    }
    void assertSignalingAllowed(contextForSocket(socket), parsed.data.callId).then((target) => {
      const isCaller = target.call.callerId.toString() === contextForSocket(socket).userId;
      if (expectedType === "offer" && !isCaller || expectedType === "answer" && isCaller) {
        throw new AppError({
          code: "CALL_SIGNALING_FORBIDDEN",
          message: "That signaling message is not valid for this participant.",
          statusCode: 403
        });
      }
      io2.to(userRoom(target.otherUserId)).emit(event, parsed.data);
      acknowledge(ack, { success: true, data: { relayed: true } });
    }).catch((error) => {
      logSocketError(socket, event, error);
      acknowledge(ack, errorResponse(error));
    });
  };
  socket.on("webrtc:offer", (payload, ack) => {
    relayDescription(payload, "offer", "webrtc:offer", ack);
  });
  socket.on("webrtc:answer", (payload, ack) => {
    relayDescription(payload, "answer", "webrtc:answer", ack);
  });
  socket.on(
    "webrtc:ice-candidate",
    (payload, ack) => {
      const parsed = webrtcIceCandidateSchema.safeParse(payload);
      if (!parsed.success) {
        acknowledge(ack, socketValidationError);
        return;
      }
      void assertSignalingAllowed(contextForSocket(socket), parsed.data.callId).then((target) => {
        io2.to(userRoom(target.otherUserId)).emit(
          "webrtc:ice-candidate",
          parsed.data
        );
        acknowledge(ack, { success: true, data: { relayed: true } });
      }).catch((error) => {
        logSocketError(socket, "webrtc:ice-candidate", error);
        acknowledge(ack, errorResponse(error));
      });
    }
  );
}
function portFromEnvironment() {
  const port = Number(process.env.CALLSERVER_HTTP_PORT ?? process.env.CALLSERVER_PORT ?? 5101);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("CALLSERVER_HTTP_PORT must be a valid TCP port");
  }
  return port;
}
var app = express();
app.disable("x-powered-by");
app.use(cors({ origin: allowedWebOrigins, credentials: true }));
app.use(express.json({ limit: "64kb" }));
app.get("/healthz", (_request, response) => {
  const database = getDatabaseStatus();
  const redis = getRedisStatus();
  response.status(database === "connected" && redis === "connected" ? 200 : 503).json({
    service: "callserver",
    status: database === "connected" && redis === "connected" ? "ok" : "degraded",
    database,
    redis
  });
});
app.use("/api/v1/calls", callRouter);
app.use(notFoundHandler);
app.use(errorHandler);
var httpServer = createServer(app);
var io = new Server(httpServer, {
  cors: { origin: allowedWebOrigins, credentials: true },
  path: "/calls/socket.io"
});
var calls = io.of("/calls");
var timeoutCoordinator;
var shuttingDown = false;
installSocketAuthentication(calls);
calls.on("connection", (socket) => {
  const context = contextForSocket(socket);
  socket.join(userRoom(context.userId));
  installCallEvents(calls, socket);
  socket.on("disconnect", () => {
    void cancelCallsForSession(context.sessionId).then((affected) => {
      for (const call of affected) {
        const event = call.status === "failed" ? "call:failed" : "call:cancelled";
        broadcastCall(calls, event, callSignal(call));
      }
    }).catch((error) => {
      logger.warn({ err: error }, "Call session cleanup deferred");
    });
  });
});
async function closeHttpServer(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Call server shutdown started");
  timeoutCoordinator?.stop();
  await closeHttpServer(httpServer);
  await Promise.all([disconnectDatabase(), disconnectRedis()]);
  process.exitCode = exitCode;
}
async function startCallServer() {
  await connectDatabase();
  await connectRedis();
  await initializeAuthModels();
  await initializeConversationModels();
  await initializeCallModels();
  await initializeNotificationModels();
  await initializeBlockModels();
  await recoverCallTimeouts();
  timeoutCoordinator = startCallTimeoutCoordinator(async (call) => {
    broadcastCall(calls, "call:missed", callSignal(call));
    await dispatchMissedCallNotification(call);
  });
  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(portFromEnvironment(), "0.0.0.0", resolve);
  });
  logger.info({ port: portFromEnvironment(), namespace: "/calls" }, "Call server listening");
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
if (env.NODE_ENV !== "test") {
  void startCallServer().catch((error) => {
    logger.fatal({ err: error }, "Call server startup failed");
    void shutdown("startup-failure", 1);
  });
}
export {
  shutdown,
  startCallServer
};