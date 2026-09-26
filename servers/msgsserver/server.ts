import { createServer, type Server as HttpServer } from "node:http";

import { createAdapter } from "@socket.io/redis-adapter";
import cors from "cors";
import express from "express";
import { Server, type Namespace, type Socket } from "socket.io";

import type {
  ApiFailure,
  ApiSuccess,
  E2EFEEncryptedMessageData,
} from "@terqivo/contracts";
import { allowedWebOrigins, env } from "../../apps/api/src/config/env.js";
import { AppError } from "../../apps/api/src/core/errors.js";
import { errorHandler } from "../../apps/api/src/middleware/error-handler.js";
import { notFoundHandler } from "../../apps/api/src/middleware/not-found.js";
import {
  connectDatabase,
  disconnectDatabase,
  getDatabaseStatus,
} from "../../apps/api/src/lib/database.js";
import { logger } from "../../apps/api/src/lib/logger.js";
import {
  connectRedis,
  disconnectRedis,
  getRedisStatus,
  redisClient,
} from "../../apps/api/src/lib/redis.js";
import { initializeAuthModels } from "../../apps/api/src/modules/auth/auth.service.js";
import {
  createConversationRouter,
} from "../../apps/api/src/modules/conversations/conversation.routes.js";
import {
  getOwnedConversation,
  getConversationParticipantIds,
  initializeConversationModels,
} from "../../apps/api/src/modules/conversations/conversation.service.js";
import { subscribeToConversationCleared } from "../../apps/api/src/modules/conversations/conversation.events.js";
import {
  createMessageActionRouter,
  createMessageRouter,
} from "../../apps/api/src/modules/messages/message.routes.js";
import {
  markConversationRead,
  markMessageDelivered,
  sendTextMessage,
  initializeMessageModels,
} from "../../apps/api/src/modules/messages/message.service.js";
import { sendEncryptedMessage } from "../../apps/api/src/modules/messages/encrypted-message.service.js";
import {
  e2efeEncryptedMessageSchema,
  socketDeliveredSchema,
  socketMessageSendSchema,
  socketReadSchema,
  typingSchema,
} from "../../apps/api/src/modules/messages/message.validation.js";
import {
  subscribeToEncryptedMessageCreated,
  subscribeToEncryptedMessageUpdated,
  subscribeToMessageCreated,
  subscribeToMessageDeleted,
  subscribeToMessageReactionUpdated,
  subscribeToMessageUpdated,
  subscribeToMessageUserStateUpdated,
} from "../../apps/api/src/modules/messages/message.events.js";
import { initializeE2EFEModels } from "../../apps/api/src/modules/e2efe/e2efe.service.js";
import { initializeBlockModels } from "../../apps/api/src/modules/privacy/block.service.js";
import {
  endUserPresenceSession,
  initializePresenceModels,
  startUserPresenceSession,
} from "../../apps/api/src/modules/users/presence.service.js";
import { installSocketAuthentication } from "../../apps/api/src/sockets/socket-auth.js";
import { registerPresence, type PresenceRegistration } from "../../apps/api/src/sockets/presence.js";
import type { AuthContext } from "../../apps/api/src/modules/auth/auth.types.js";

type SocketAck<T> = (response: ApiSuccess<T> | ApiFailure) => void;

const socketValidationError: ApiFailure = {
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    message: "The socket event payload is invalid.",
  },
};

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function contextForSocket(socket: Socket): AuthContext {
  const context = socket.data.auth as AuthContext | undefined;
  if (context === undefined) {
    throw new Error("Socket authentication context is missing");
  }
  return context;
}

function errorResponse(error: unknown): ApiFailure {
  if (error instanceof AppError) {
    return {
      success: false,
      error: { code: error.code, message: error.message },
    };
  }
  return {
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    },
  };
}

function acknowledge<T>(
  ack: SocketAck<T> | undefined,
  response: ApiSuccess<T> | ApiFailure,
): void {
  ack?.(response);
}

function logSocketError(socket: Socket, event: string, error: unknown): void {
  logger.warn(
    { socketId: socket.id, userId: socket.data.auth?.userId, event, err: error },
    "Message socket event failed",
  );
}

function notifyPresence(
  io: Namespace,
  userId: string,
  status: "online" | "offline",
  lastSeenAt: Date | null,
): Promise<void> {
  return getConversationParticipantIds(userId).then((participantIds) => {
    const payload = {
      userId,
      isOnline: status === "online",
      status,
      lastSeenAt: lastSeenAt?.toISOString() ?? null,
    };
    for (const participantId of participantIds) {
      io.to(userRoom(participantId)).emit("presence:update", payload);
    }
  });
}

function installMessageEvents(io: Namespace, socket: Socket): void {
  socket.on("message:send", (payload: unknown, ack?: SocketAck<unknown>) => {
    const parsed = socketMessageSendSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge(ack, socketValidationError);
      return;
    }

    void sendTextMessage(contextForSocket(socket), parsed.data.conversationId, parsed.data)
      .then((result) => {
        const data = { message: result.message, duplicate: result.duplicate };
        acknowledge(ack, { success: true, data });
        io.to(userRoom(result.recipientId)).emit("message:new", {
          message: result.message,
        });
        socket.to(userRoom(contextForSocket(socket).userId)).emit("message:sent", data);
      })
      .catch((error: unknown) => {
        logSocketError(socket, "message:send", error);
        acknowledge(ack, errorResponse(error));
      });
  });

  socket.on(
    "message:send-encrypted",
    (payload: unknown, ack?: SocketAck<E2EFEEncryptedMessageData>) => {
      const parsed = e2efeEncryptedMessageSchema.safeParse(payload);
      if (!parsed.success) {
        acknowledge(ack, socketValidationError);
        return;
      }
      void sendEncryptedMessage(
        contextForSocket(socket),
        parsed.data.conversationId,
        parsed.data,
      )
        .then((result) => {
          acknowledge(ack, {
            success: true,
            data: {
              message: result.message,
              envelopes: result.envelopes,
              duplicate: result.duplicate,
            },
          });
        })
        .catch((error: unknown) => {
          logSocketError(socket, "message:send-encrypted", error);
          acknowledge(ack, errorResponse(error));
        });
    },
  );

  socket.on("message:delivered", (payload: unknown, ack?: SocketAck<unknown>) => {
    const parsed = socketDeliveredSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge(ack, socketValidationError);
      return;
    }
    void markMessageDelivered(contextForSocket(socket), parsed.data.messageId)
      .then((receipt) => {
        acknowledge(ack, { success: true, data: { receipt } });
        io.to(userRoom(receipt.senderId)).emit("message:delivered", { receipt });
      })
      .catch((error: unknown) => {
        logSocketError(socket, "message:delivered", error);
        acknowledge(ack, errorResponse(error));
      });
  });

  socket.on("conversation:read", (payload: unknown, ack?: SocketAck<unknown>) => {
    const parsed = socketReadSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge(ack, socketValidationError);
      return;
    }
    void markConversationRead(
      contextForSocket(socket),
      parsed.data.conversationId,
      parsed.data,
    )
      .then(async (receipt) => {
        acknowledge(ack, { success: true, data: { receipt } });
        const conversation = await getOwnedConversation(
          contextForSocket(socket),
          receipt.conversationId,
        );
        const senderId = conversation.participants
          .find(
            (participant) =>
              participant.userId.toString() !== contextForSocket(socket).userId,
          )
          ?.userId.toString();
        if (senderId !== undefined) {
          io.to(userRoom(senderId)).emit("message:read", { receipt });
        }
      })
      .catch((error: unknown) => {
        logSocketError(socket, "conversation:read", error);
        acknowledge(ack, errorResponse(error));
      });
  });
}

function installTypingEvents(io: Namespace, socket: Socket): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const handleTyping = (
    event: "typing:start" | "typing:stop",
    payload: unknown,
    ack?: SocketAck<unknown>,
  ): void => {
    const parsed = typingSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge(ack, socketValidationError);
      return;
    }
    void getOwnedConversation(contextForSocket(socket), parsed.data.conversationId)
      .then((conversation) => {
        const other = conversation.participants.find(
          (participant) =>
            participant.userId.toString() !== contextForSocket(socket).userId,
        );
        if (other === undefined) return;

        const timerKey = `${contextForSocket(socket).userId}:${parsed.data.conversationId}`;
        const currentTimer = timers.get(timerKey);
        if (currentTimer !== undefined) clearTimeout(currentTimer);

        const typingPayload = {
          conversationId: parsed.data.conversationId,
          userId: contextForSocket(socket).userId,
        };
        io.to(userRoom(other.userId.toString())).emit(event, typingPayload);
        if (event === "typing:start") {
          timers.set(
            timerKey,
            setTimeout(() => {
              io.to(userRoom(other.userId.toString())).emit("typing:stop", typingPayload);
              timers.delete(timerKey);
            }, 5_000),
          );
        } else {
          timers.delete(timerKey);
        }
        acknowledge(ack, { success: true, data: { accepted: true } });
      })
      .catch((error: unknown) => {
        logSocketError(socket, event, error);
        acknowledge(ack, errorResponse(error));
      });
  };

  socket.on("typing:start", (payload: unknown, ack?: SocketAck<unknown>) => {
    handleTyping("typing:start", payload, ack);
  });
  socket.on("typing:stop", (payload: unknown, ack?: SocketAck<unknown>) => {
    handleTyping("typing:stop", payload, ack);
  });

  return () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
}

function portFromEnvironment(): number {
  const port = Number(process.env.MSGSSERVER_HTTP_PORT ?? process.env.MSGSSERVER_PORT ?? 5102);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("MSGSSERVER_HTTP_PORT must be a valid TCP port");
  }
  return port;
}

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: allowedWebOrigins, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.get("/healthz", (_request, response) => {
  const database = getDatabaseStatus();
  const redis = getRedisStatus();
  response.status(database === "connected" && redis === "connected" ? 200 : 503).json({
    service: "msgsserver",
    status: database === "connected" && redis === "connected" ? "ok" : "degraded",
    database,
    redis,
  });
});
app.use("/api/v1/conversations", createConversationRouter());
app.use("/api/v1/conversations", createMessageRouter());
app.use("/api/v1/messages", createMessageActionRouter());
app.use(notFoundHandler);
app.use(errorHandler);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: allowedWebOrigins, credentials: true },
  path: "/messages/socket.io",
});
const messages = io.of("/messages");
let redisSubscriber: ReturnType<typeof redisClient.duplicate> | undefined;
let unsubscribers: Array<() => void> = [];
let presenceRegistrations = new Map<string, PresenceRegistration>();
let shuttingDown = false;

installSocketAuthentication(messages);

function installEventSubscriptions(): void {
  unsubscribers = [
    subscribeToMessageCreated((event) => {
      messages.to(userRoom(event.recipientId)).emit("message:new", { message: event.message });
      messages.to(userRoom(event.senderId)).emit("message:sent", {
        message: event.message,
        duplicate: false,
      });
    }),
    subscribeToEncryptedMessageCreated((event) => {
      messages.to(userRoom(event.recipientId)).emit("message:encrypted-new", {
        message: event.message,
        envelope: event.envelope,
      });
    }),
    subscribeToEncryptedMessageUpdated((event) => {
      messages.to(userRoom(event.recipientId)).emit("message:encrypted-updated", {
        message: event.message,
        envelope: event.envelope,
      });
    }),
    subscribeToMessageReactionUpdated((event) => {
      messages.to(userRoom(event.recipientId)).emit("message:reaction-updated", {
        message: event.message,
      });
      messages.to(userRoom(event.senderId)).emit("message:reaction-updated", {
        message: event.message,
      });
    }),
    subscribeToMessageUpdated((event) => {
      messages.to(userRoom(event.recipientId)).emit("message:updated", { message: event.message });
      messages.to(userRoom(event.senderId)).emit("message:updated", { message: event.message });
    }),
    subscribeToMessageDeleted((event) => {
      messages.to(userRoom(event.recipientId)).emit("message:deleted", { message: event.message });
      messages.to(userRoom(event.senderId)).emit("message:deleted", { message: event.message });
    }),
    subscribeToMessageUserStateUpdated((event) => {
      messages.to(userRoom(event.userId)).emit("message:user-state-updated", event);
    }),
    subscribeToConversationCleared((event) => {
      messages.to(userRoom(event.userId)).emit("conversation:cleared", event);
    }),
  ];
}

messages.on("connection", (socket) => {
  const context = contextForSocket(socket);
  socket.join(userRoom(context.userId));
  const typingCleanup = installTypingEvents(messages, socket);
  let disconnected = false;

  void registerPresence(context.userId, socket.id)
    .then(async (registration) => {
      if (disconnected) {
        await registration.stop();
        return;
      }
      presenceRegistrations.set(socket.id, registration);
      if (registration.becameOnline) {
        await startUserPresenceSession(context.userId, context.sessionId);
        await notifyPresence(messages, context.userId, "online", null);
      }
    })
    .catch((error: unknown) => {
      logger.error({ socketId: socket.id, userId: context.userId, err: error }, "Message presence registration failed");
      socket.disconnect(true);
    });

  installMessageEvents(messages, socket);
  socket.on("disconnect", () => {
    disconnected = true;
    typingCleanup();
    const registration = presenceRegistrations.get(socket.id);
    presenceRegistrations.delete(socket.id);
    if (registration === undefined) return;
    void registration.stop()
      .then(async (result) => {
        if (result.becameOffline) {
          const lastSeenAt = result.lastSeenAt ?? new Date();
          await endUserPresenceSession(context.userId, lastSeenAt);
          await notifyPresence(messages, context.userId, "offline", lastSeenAt);
        }
      })
      .catch((error: unknown) => {
        logger.error({ socketId: socket.id, userId: context.userId, err: error }, "Message presence cleanup failed");
      });
  });
});

async function closeHttpServer(server: HttpServer): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Messages server shutdown started");
  for (const registration of presenceRegistrations.values()) {
    await registration.stop().catch(() => undefined);
  }
  presenceRegistrations.clear();
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  unsubscribers = [];
  await closeHttpServer(httpServer);
  if (redisSubscriber?.isOpen) await redisSubscriber.quit();
  await Promise.all([disconnectDatabase(), disconnectRedis()]);
  process.exitCode = exitCode;
}

export async function startMessagesServer(): Promise<void> {
  await connectDatabase();
  await connectRedis();
  await initializeAuthModels();
  await initializeConversationModels();
  await initializeMessageModels();
  await initializePresenceModels();
  await initializeBlockModels();
  await initializeE2EFEModels();
  redisSubscriber = redisClient.duplicate();
  redisSubscriber.on("error", (error: Error) => {
    logger.error({ err: error }, "Messages Socket.IO Redis subscriber error");
  });
  await redisSubscriber.connect();
  io.adapter(createAdapter(redisClient, redisSubscriber));
  installEventSubscriptions();

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(portFromEnvironment(), "0.0.0.0", resolve);
  });
  logger.info({ port: portFromEnvironment(), namespace: "/messages" }, "Messages server listening");
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

if (env.NODE_ENV !== "test") {
  void startMessagesServer().catch((error: unknown) => {
    logger.fatal({ err: error }, "Messages server startup failed");
    void shutdown("startup-failure", 1);
  });
}
