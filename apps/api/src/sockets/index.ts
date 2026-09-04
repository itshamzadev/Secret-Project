import type { Server as HttpServer } from "node:http";

import { createAdapter } from "@socket.io/redis-adapter";
import type {
  ApiFailure,
  ApiSuccess,
  CallIncomingSocketEvent,
  CallSocketEvent,
  CallAnsweredElsewhereEvent,
} from "@terqivo/contracts";
import { Server, type Socket } from "socket.io";

import { allowedWebOrigins } from "../config/env.js";
import { AppError } from "../core/errors.js";
import { logger } from "../lib/logger.js";
import { redisClient } from "../lib/redis.js";
import {
  getConversationParticipantIds,
  getOwnedConversation,
} from "../modules/conversations/conversation.service.js";
import {
  markConversationRead,
  markMessageDelivered,
  sendTextMessage,
} from "../modules/messages/message.service.js";
import {
  socketDeliveredSchema,
  socketMessageSendSchema,
  socketReadSchema,
  typingSchema,
} from "../modules/messages/message.validation.js";
import {
  endUserPresenceSession,
  startUserPresenceSession,
} from "../modules/users/presence.service.js";
import { registerPresence, type PresenceRegistration } from "./presence.js";
import {
  registerSessionSocket,
  hasSessionSockets,
  unregisterSessionSocket,
} from "./session-registry.js";
import { installSocketAuthentication } from "./socket-auth.js";
import {
  acceptCall,
  assertSignalingAllowed,
  callSignal,
  cancelCall,
  cancelCallsForSession,
  declineCall,
  endCall,
  failCall,
  startCall,
} from "../modules/calls/call.service.js";
import {
  callIdParamsSchema,
  callStartSchema,
  webrtcDescriptionSchema,
  webrtcIceCandidateSchema,
} from "../modules/calls/call.validation.js";
import {
  recoverCallTimeouts,
  removeCallTimeout,
  scheduleCallTimeout,
  startCallTimeoutCoordinator,
} from "../modules/calls/call-timeouts.js";
import { toCallUserDto } from "../modules/calls/call.dto.js";
import {
  dispatchIncomingCallNotification,
  dispatchMissedCallNotification,
} from "../modules/notifications/push.service.js";
import { subscribeToMessageCreated } from "../modules/messages/message.events.js";

export interface SocketRuntime {
  io: Server;
  close: () => Promise<void>;
}

type SocketAck<T> = (response: ApiSuccess<T> | ApiFailure) => void;

const SOCKET_VALIDATION_ERROR: ApiFailure = {
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    message: "The socket event payload is invalid.",
  },
};

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function acknowledge<T>(
  ack: SocketAck<T> | undefined,
  response: ApiSuccess<T> | ApiFailure,
): void {
  if (ack !== undefined) {
    ack(response);
  }
}

function contextForSocket(socket: Socket) {
  const context = socket.data.auth;
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
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
    },
  };
}

function logSocketError(socket: Socket, event: string, error: unknown): void {
  if (error instanceof AppError) {
    logger.warn(
      {
        socketId: socket.id,
        userId: socket.data.auth?.userId,
        event,
        code: error.code,
      },
      "Socket event rejected",
    );
    return;
  }
  logger.error(
    { socketId: socket.id, userId: socket.data.auth?.userId, event },
    "Socket event failed",
  );
}

function notifyPresence(
  io: Server,
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

function broadcastCall(
  io: Server,
  event:
    | "call:declined"
    | "call:cancelled"
    | "call:ended"
    | "call:missed"
    | "call:failed",
  call: CallSocketEvent["call"],
): void {
  const payload: CallSocketEvent = { call };
  io.to(userRoom(call.callerId)).emit(event, payload);
  io.to(userRoom(call.calleeId)).emit(event, payload);
}

function removeCallTimeoutSafely(callId: string): void {
  void removeCallTimeout(callId).catch((error: unknown) => {
    logger.warn({ callId, err: error }, "Call timeout cleanup deferred");
  });
}

function installCallEvents(io: Server, socket: Socket): void {
  socket.on("call:start", (payload: unknown, ack?: SocketAck<unknown>) => {
    const parsed = callStartSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge(ack, SOCKET_VALIDATION_ERROR);
      return;
    }
    void startCall(contextForSocket(socket), parsed.data)
      .then(async (result) => {
        const call = callSignal(result.call);
        acknowledge(ack, { success: true, data: { call } });
        socket.emit("call:ringing", { call } satisfies CallSocketEvent);
        const incoming: CallIncomingSocketEvent = {
          call,
          caller: toCallUserDto(result.caller),
        };
        io.to(userRoom(result.call.calleeId.toString())).emit(
          "call:incoming",
          incoming,
        );
        void dispatchIncomingCallNotification(result.call, result.caller);
        await scheduleCallTimeout(
          result.call._id.toString(),
          result.call.initiatedAt,
        );
      })
      .catch((error: unknown) => {
        logSocketError(socket, "call:start", error);
        acknowledge(ack, errorResponse(error));
      });
  });

  socket.on("call:accept", (payload: unknown, ack?: SocketAck<unknown>) => {
    const parsed = callIdParamsSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge(ack, SOCKET_VALIDATION_ERROR);
      return;
    }
    void acceptCall(contextForSocket(socket), parsed.data.callId)
      .then((result) => {
        const call = callSignal(result.call);
        acknowledge(ack, {
          success: true,
          data: { call, changed: result.changed },
        });
        if (!result.changed) {
          socket.emit("call:answered-elsewhere", {
            callId: call.id,
            type: call.type,
          } satisfies CallAnsweredElsewhereEvent);
          return;
        }
        removeCallTimeoutSafely(call.id);
        socket.emit("call:accepted", { call } satisfies CallSocketEvent);
        io.to(userRoom(call.callerId)).emit("call:accepted", {
          call,
        } satisfies CallSocketEvent);
        socket.to(userRoom(call.calleeId)).emit("call:answered-elsewhere", {
          callId: call.id,
          type: call.type,
        } satisfies CallAnsweredElsewhereEvent);
      })
      .catch((error: unknown) => {
        logSocketError(socket, "call:accept", error);
        acknowledge(ack, errorResponse(error));
      });
  });

  socket.on("call:decline", (payload: unknown, ack?: SocketAck<unknown>) => {
    const parsed = callIdParamsSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge(ack, SOCKET_VALIDATION_ERROR);
      return;
    }
    void declineCall(contextForSocket(socket), parsed.data.callId)
      .then((result) => {
        const call = callSignal(result.call);
        acknowledge(ack, {
          success: true,
          data: { call, changed: result.changed },
        });
        if (result.changed) {
          removeCallTimeoutSafely(call.id);
          broadcastCall(io, "call:declined", call);
        }
      })
      .catch((error: unknown) => {
        logSocketError(socket, "call:decline", error);
        acknowledge(ack, errorResponse(error));
      });
  });

  socket.on("call:cancel", (payload: unknown, ack?: SocketAck<unknown>) => {
    const parsed = callIdParamsSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge(ack, SOCKET_VALIDATION_ERROR);
      return;
    }
    void cancelCall(contextForSocket(socket), parsed.data.callId)
      .then((result) => {
        const call = callSignal(result.call);
        acknowledge(ack, {
          success: true,
          data: { call, changed: result.changed },
        });
        if (result.changed) {
          removeCallTimeoutSafely(call.id);
          broadcastCall(io, "call:cancelled", call);
        }
      })
      .catch((error: unknown) => {
        logSocketError(socket, "call:cancel", error);
        acknowledge(ack, errorResponse(error));
      });
  });

  socket.on("call:end", (payload: unknown, ack?: SocketAck<unknown>) => {
    const parsed = callIdParamsSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge(ack, SOCKET_VALIDATION_ERROR);
      return;
    }
    void endCall(contextForSocket(socket), parsed.data.callId)
      .then((result) => {
        const call = callSignal(result.call);
        acknowledge(ack, {
          success: true,
          data: { call, changed: result.changed },
        });
        if (result.changed) {
          removeCallTimeoutSafely(call.id);
          broadcastCall(io, "call:ended", call);
        }
      })
      .catch((error: unknown) => {
        logSocketError(socket, "call:end", error);
        acknowledge(ack, errorResponse(error));
      });
  });

  socket.on("call:fail", (payload: unknown, ack?: SocketAck<unknown>) => {
    const parsed = callIdParamsSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge(ack, SOCKET_VALIDATION_ERROR);
      return;
    }
    void failCall(contextForSocket(socket), parsed.data.callId)
      .then((result) => {
        const call = callSignal(result.call);
        acknowledge(ack, {
          success: true,
          data: { call, changed: result.changed },
        });
        if (result.changed) {
          removeCallTimeoutSafely(call.id);
          broadcastCall(io, "call:failed", call);
        }
      })
      .catch((error: unknown) => {
        logSocketError(socket, "call:fail", error);
        acknowledge(ack, errorResponse(error));
      });
  });

  const relayDescription = (
    payload: unknown,
    expectedType: "offer" | "answer",
    event: "webrtc:offer" | "webrtc:answer",
    ack?: SocketAck<{ relayed: boolean }>,
  ): void => {
    const parsed = webrtcDescriptionSchema.safeParse(payload);
    if (!parsed.success || parsed.data.description.type !== expectedType) {
      acknowledge(ack, SOCKET_VALIDATION_ERROR);
      return;
    }
    void assertSignalingAllowed(contextForSocket(socket), parsed.data.callId)
      .then(async (target) => {
        const isCaller =
          target.call.callerId.toString() === contextForSocket(socket).userId;
        if (
          (expectedType === "offer" && !isCaller) ||
          (expectedType === "answer" && isCaller)
        ) {
          throw new AppError({
            code: "CALL_SIGNALING_FORBIDDEN",
            message:
              "That signaling message is not valid for this participant.",
            statusCode: 403,
          });
        }
        io.to(userRoom(target.otherUserId)).emit(event, parsed.data);
        acknowledge(ack, { success: true, data: { relayed: true } });
      })
      .catch((error: unknown) => {
        logSocketError(socket, event, error);
        acknowledge(ack, errorResponse(error));
      });
  };

  socket.on(
    "webrtc:offer",
    (payload: unknown, ack?: SocketAck<{ relayed: boolean }>) => {
      relayDescription(payload, "offer", "webrtc:offer", ack);
    },
  );
  socket.on(
    "webrtc:answer",
    (payload: unknown, ack?: SocketAck<{ relayed: boolean }>) => {
      relayDescription(payload, "answer", "webrtc:answer", ack);
    },
  );
  socket.on(
    "webrtc:ice-candidate",
    (payload: unknown, ack?: SocketAck<{ relayed: boolean }>) => {
      const parsed = webrtcIceCandidateSchema.safeParse(payload);
      if (!parsed.success) {
        acknowledge(ack, SOCKET_VALIDATION_ERROR);
        return;
      }
      void assertSignalingAllowed(contextForSocket(socket), parsed.data.callId)
        .then((target) => {
          io.to(userRoom(target.otherUserId)).emit(
            "webrtc:ice-candidate",
            parsed.data,
          );
          acknowledge(ack, { success: true, data: { relayed: true } });
        })
        .catch((error: unknown) => {
          logSocketError(socket, "webrtc:ice-candidate", error);
          acknowledge(ack, errorResponse(error));
        });
    },
  );
}

function installMessageEvents(io: Server, socket: Socket): void {
  socket.on("message:send", (payload: unknown, ack?: SocketAck<unknown>) => {
    const parsed = socketMessageSendSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge(ack, SOCKET_VALIDATION_ERROR);
      return;
    }

    void sendTextMessage(
      contextForSocket(socket),
      parsed.data.conversationId,
      parsed.data,
    )
      .then((result) => {
        const data = {
          message: result.message,
          duplicate: result.duplicate,
        };
        acknowledge(ack, { success: true, data });
        io.to(userRoom(result.recipientId)).emit("message:new", {
          message: result.message,
        });
        socket
          .to(userRoom(contextForSocket(socket).userId))
          .emit("message:sent", data);
      })
      .catch((error: unknown) => {
        logSocketError(socket, "message:send", error);
        acknowledge(ack, errorResponse(error));
      });
  });

  socket.on(
    "message:delivered",
    (payload: unknown, ack?: SocketAck<unknown>) => {
      const parsed = socketDeliveredSchema.safeParse(payload);
      if (!parsed.success) {
        acknowledge(ack, SOCKET_VALIDATION_ERROR);
        return;
      }
      void markMessageDelivered(contextForSocket(socket), parsed.data.messageId)
        .then((receipt) => {
          acknowledge(ack, { success: true, data: { receipt } });
          io.to(userRoom(receipt.senderId)).emit("message:delivered", {
            receipt,
          });
        })
        .catch((error: unknown) => {
          logSocketError(socket, "message:delivered", error);
          acknowledge(ack, errorResponse(error));
        });
    },
  );

  socket.on(
    "conversation:read",
    (payload: unknown, ack?: SocketAck<unknown>) => {
      const parsed = socketReadSchema.safeParse(payload);
      if (!parsed.success) {
        acknowledge(ack, SOCKET_VALIDATION_ERROR);
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
                participant.userId.toString() !==
                contextForSocket(socket).userId,
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
    },
  );
}

function installTypingEvents(io: Server, socket: Socket): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const handleTyping = (
    event: "typing:start" | "typing:stop",
    payload: unknown,
    ack?: SocketAck<unknown>,
  ): void => {
    const parsed = typingSchema.safeParse(payload);
    if (!parsed.success) {
      acknowledge(ack, SOCKET_VALIDATION_ERROR);
      return;
    }
    void getOwnedConversation(
      contextForSocket(socket),
      parsed.data.conversationId,
    )
      .then((conversation) => {
        const other = conversation.participants.find(
          (participant) =>
            participant.userId.toString() !== contextForSocket(socket).userId,
        );
        if (other === undefined) {
          return;
        }
        const timerKey = `${contextForSocket(socket).userId}:${parsed.data.conversationId}`;
        const currentTimer = timers.get(timerKey);
        if (currentTimer !== undefined) {
          clearTimeout(currentTimer);
          timers.delete(timerKey);
        }
        const typingPayload = {
          conversationId: parsed.data.conversationId,
          userId: contextForSocket(socket).userId,
        };
        io.to(userRoom(other.userId.toString())).emit(event, typingPayload);
        if (event === "typing:start") {
          timers.set(
            timerKey,
            setTimeout(() => {
              io.to(userRoom(other.userId.toString())).emit(
                "typing:stop",
                typingPayload,
              );
              timers.delete(timerKey);
            }, 5_000),
          );
        }
        acknowledge(ack, {
          success: true,
          data: { accepted: true },
        });
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
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
  };
}

export async function createSocketServer(
  httpServer: HttpServer,
): Promise<SocketRuntime> {
  const redisSubscriber = redisClient.duplicate();
  redisSubscriber.on("error", (error: Error) => {
    logger.error({ err: error }, "Redis Socket.IO subscriber error");
  });
  await redisSubscriber.connect();

  const io = new Server(httpServer, {
    cors: {
      origin: allowedWebOrigins,
      credentials: true,
    },
  });

  io.adapter(createAdapter(redisClient, redisSubscriber));
  installSocketAuthentication(io);
  await recoverCallTimeouts();
  const callTimeoutCoordinator = startCallTimeoutCoordinator(async (call) => {
    broadcastCall(io, "call:missed", callSignal(call));
    await dispatchMissedCallNotification(call);
  });
  const unsubscribeMessageEvents = subscribeToMessageCreated((event) => {
    io.to(userRoom(event.recipientId)).emit("message:new", {
      message: event.message,
    });
    io.to(userRoom(event.senderId)).emit("message:sent", {
      message: event.message,
      duplicate: false,
    });
  });

  io.on("connection", (socket) => {
    const context = contextForSocket(socket);
    const typingCleanup = installTypingEvents(io, socket);
    let presence: PresenceRegistration | undefined;
    let presenceSetupComplete = false;
    let presenceStopRequested = false;
    let presenceStopStarted = false;
    let disconnected = false;
    socket.join(userRoom(context.userId));
    registerSessionSocket(context.sessionId, socket);

    const stopPresence = (registration: PresenceRegistration): void => {
      if (presenceStopStarted) {
        return;
      }
      presenceStopStarted = true;
      void registration
        .stop()
        .then(async (result) => {
          logger.info(
            { socketId: socket.id, userId: context.userId },
            "Socket client disconnected",
          );
          if (result.becameOffline) {
            const lastSeenAt = result.lastSeenAt ?? new Date();
            await endUserPresenceSession(context.userId, lastSeenAt);
            await notifyPresence(io, context.userId, "offline", lastSeenAt);
          }
        })
        .catch((error: unknown) => {
          logger.error(
            { socketId: socket.id, userId: context.userId, err: error },
            "Socket presence cleanup failed",
          );
        });
    };

    void registerPresence(context.userId, socket.id)
      .then(async (registration) => {
        presence = registration;
        logger.info(
          {
            socketId: socket.id,
            userId: context.userId,
            sessionId: context.sessionId,
          },
          "Socket client connected",
        );
        if (registration.becameOnline && !disconnected) {
          await startUserPresenceSession(context.userId, context.sessionId);
        }
        if (registration.becameOnline && !disconnected) {
          await notifyPresence(io, context.userId, "online", null);
        }
        presenceSetupComplete = true;
        if (presenceStopRequested) {
          stopPresence(registration);
        }
      })
      .catch((error: unknown) => {
        presenceSetupComplete = true;
        presenceStopRequested = true;
        if (presence !== undefined) {
          stopPresence(presence);
        }
        logger.error(
          { socketId: socket.id, userId: context.userId, err: error },
          "Socket presence registration failed",
        );
        socket.disconnect(true);
      });

    installMessageEvents(io, socket);
    installCallEvents(io, socket);

    socket.on("disconnect", (reason) => {
      disconnected = true;
      unregisterSessionSocket(context.sessionId, socket);
      typingCleanup();
      logger.debug(
        { reason, socketId: socket.id, userId: context.userId },
        "Socket disconnect received",
      );
      if (!hasSessionSockets(context.sessionId)) {
        void cancelCallsForSession(context.sessionId)
          .then((calls) => {
            for (const call of calls) {
              broadcastCall(
                io,
                call.status === "cancelled" ? "call:cancelled" : "call:failed",
                callSignal(call),
              );
            }
          })
          .catch((error: unknown) => {
            logger.error(
              { socketId: socket.id, userId: context.userId, err: error },
              "Socket call cleanup failed",
            );
          });
      }
      presenceStopRequested = true;
      if (presenceSetupComplete && presence !== undefined) {
        stopPresence(presence);
      }
    });
  });

  return {
    io,
    close: async () => {
      callTimeoutCoordinator.stop();
      unsubscribeMessageEvents();
      await io.close();
      if (redisSubscriber.isOpen) {
        await redisSubscriber.quit();
      }
    },
  };
}
