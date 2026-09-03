import { io, type Socket } from "socket.io-client";

import type {
  ApiFailure,
  ApiSuccess,
  CallIncomingSocketEvent,
  CallSocketEvent,
  PresenceEvent,
  SocketMessageEvent,
  SocketMessageSendInput,
  TypingEvent,
  WebRtcDescriptionPayload,
  WebRtcIceCandidatePayload,
} from "@terqivo/contracts";

export type SocketAck<T> = (response: ApiSuccess<T> | ApiFailure) => void;

export interface RealtimeClientOptions {
  url: string;
  getAccessToken: () => string | null;
}

export class TerqivoRealtimeClient {
  public readonly socket: Socket;
  private readonly getAccessToken: () => string | null;

  public constructor(options: RealtimeClientOptions) {
    this.getAccessToken = options.getAccessToken;
    this.socket = io(options.url, {
      autoConnect: false,
      transports: ["websocket", "polling"],
      auth: (callback) => {
        callback({ token: this.getAccessToken() ?? "" });
      },
    });
  }

  public connect(): void {
    if (!this.socket.connected) this.socket.connect();
  }

  public disconnect(): void {
    this.socket.disconnect();
  }

  public sendMessage(
    input: SocketMessageSendInput,
    ack?: SocketAck<{
      message: SocketMessageEvent["message"];
      duplicate: boolean;
    }>,
  ): void {
    this.socket.emit("message:send", input, ack);
  }

  public startTyping(conversationId: string): void {
    this.socket.emit("typing:start", { conversationId });
  }

  public stopTyping(conversationId: string): void {
    this.socket.emit("typing:stop", { conversationId });
  }

  public markDelivered(messageId: string): void {
    this.socket.emit("message:delivered", { messageId });
  }

  public markRead(conversationId: string, lastReadMessageId: string): void {
    this.socket.emit("conversation:read", {
      conversationId,
      lastReadMessageId,
    });
  }

  public onMessage(handler: (event: SocketMessageEvent) => void): () => void {
    this.socket.on("message:new", handler);
    return () => this.socket.off("message:new", handler);
  }

  public onTyping(
    handler: (event: TypingEvent, typing: boolean) => void,
  ): () => void {
    const onStart = (event: TypingEvent) => handler(event, true);
    const onStop = (event: TypingEvent) => handler(event, false);
    this.socket.on("typing:start", onStart);
    this.socket.on("typing:stop", onStop);
    return () => {
      this.socket.off("typing:start", onStart);
      this.socket.off("typing:stop", onStop);
    };
  }

  public onPresence(handler: (event: PresenceEvent) => void): () => void {
    this.socket.on("presence:update", handler);
    return () => this.socket.off("presence:update", handler);
  }

  public onIncomingCall(
    handler: (event: CallIncomingSocketEvent) => void,
  ): () => void {
    this.socket.on("call:incoming", handler);
    return () => this.socket.off("call:incoming", handler);
  }

  public onCallEvent(handler: (event: CallSocketEvent) => void): () => void {
    for (const event of [
      "call:accepted",
      "call:declined",
      "call:cancelled",
      "call:ended",
      "call:missed",
      "call:failed",
    ]) {
      this.socket.on(event, handler);
    }
    return () => {
      for (const event of [
        "call:accepted",
        "call:declined",
        "call:cancelled",
        "call:ended",
        "call:missed",
        "call:failed",
      ]) {
        this.socket.off(event, handler);
      }
    };
  }

  public onOffer(
    handler: (event: WebRtcDescriptionPayload) => void,
  ): () => void {
    this.socket.on("webrtc:offer", handler);
    return () => this.socket.off("webrtc:offer", handler);
  }

  public onAnswer(
    handler: (event: WebRtcDescriptionPayload) => void,
  ): () => void {
    this.socket.on("webrtc:answer", handler);
    return () => this.socket.off("webrtc:answer", handler);
  }

  public onIceCandidate(
    handler: (event: WebRtcIceCandidatePayload) => void,
  ): () => void {
    this.socket.on("webrtc:ice-candidate", handler);
    return () => this.socket.off("webrtc:ice-candidate", handler);
  }
}
