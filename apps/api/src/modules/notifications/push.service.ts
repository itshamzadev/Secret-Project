import type { CallType, MessageDto } from "@terqivo/contracts";

import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { redisClient } from "../../lib/redis.js";
import type { UserDocument } from "../users/user.types.js";
import { getUserById } from "../users/user.service.js";
import {
  getEnabledPushDevices,
  disablePushTokens,
} from "./notification.service.js";
import type { CallDocument } from "../calls/call.types.js";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: "default";
  priority: "high";
  channelId: "messages" | "calls";
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  details?: Record<string, unknown>;
}

interface TicketTokenPair {
  id: string;
  token: string;
}

interface PushTicketSummary {
  ticketCount: number;
  okTicketCount: number;
  ticketIdCount: number;
  errorCodes: string[];
}

interface PushReceiptSummary {
  receiptCount: number;
  okReceiptCount: number;
  errorReceiptCount: number;
  errorCodes: string[];
}

export interface PushDiagnosticResult {
  activeDeviceCount: number;
  expoTicketStatus: "ok" | "error" | "partial" | "not_sent";
  ticketIdPresent: boolean;
  expoReceiptStatus: "ok" | "error" | "not_checked";
  receiptErrorCode: string | null;
}

interface PushReceiptResult {
  status: "ok" | "error";
  summary: PushReceiptSummary;
}

interface ExpoBatchResult {
  ticketSummary: PushTicketSummary;
  receipt: PushReceiptResult | null;
}

interface ExpoBatchOptions {
  waitForReceipt?: boolean;
  receiptDelayMs?: number;
}

interface MessagePushInput {
  message: MessageDto;
  recipientId: string;
  senderId: string;
}

interface MessagePayloadInput {
  message: MessageDto;
  sender: Pick<UserDocument, "displayName" | "username">;
}

const pushDeduplicationTtlSeconds = 86_400;
const expoBatchSize = 100;
const expoRequestTimeoutMs = 10_000;
const expoReceiptDelayMs = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function notificationPreview(message: MessageDto): string {
  if (message.type !== "text") return "New message";
  const preview = message.text.replace(/\s+/g, " ").trim();
  return preview.length > 160 ? `${preview.slice(0, 157)}...` : preview;
}

export function buildMessagePushPayload(
  token: string,
  input: MessagePayloadInput,
): ExpoPushMessage {
  return {
    to: token,
    title: input.sender.displayName,
    body: notificationPreview(input.message),
    data: {
      type: "message",
      conversationId: input.message.conversationId,
      senderId: input.message.senderId,
      messageId: input.message.id,
    },
    sound: "default",
    priority: "high",
    channelId: "messages",
  };
}

export function buildMissedCallPushPayload(
  token: string,
  call: Pick<CallDocument, "_id" | "type" | "callerId" | "calleeId">,
  caller: Pick<UserDocument, "displayName">,
): ExpoPushMessage {
  const callType: CallType = call.type;
  return {
    to: token,
    title: `Missed ${callType} call`,
    body: caller.displayName,
    data: {
      type: "missed_call",
      callId: call._id.toString(),
      callerId: call.callerId.toString(),
      callType,
    },
    sound: "default",
    priority: "high",
    channelId: "calls",
  };
}

function pushErrorCode(value: unknown): string | null {
  if (!isRecord(value) || value.status !== "error") return null;
  const details = isRecord(value.details) ? value.details : undefined;
  return typeof details?.error === "string" ? details.error : null;
}

export function pushErrorCodesFromResponse(response: unknown): string[] {
  if (!isRecord(response) || !Array.isArray(response.data)) return [];
  return [
    ...new Set(
      response.data
        .map((ticket: unknown) => pushErrorCode(ticket))
        .filter((code): code is string => code !== null),
    ),
  ];
}

function pushTicketSummary(response: unknown): PushTicketSummary {
  if (!isRecord(response) || !Array.isArray(response.data)) {
    return {
      ticketCount: 0,
      okTicketCount: 0,
      ticketIdCount: 0,
      errorCodes: [],
    };
  }

  return {
    ticketCount: response.data.length,
    okTicketCount: response.data.filter(
      (ticket: unknown) => isRecord(ticket) && ticket.status === "ok",
    ).length,
    ticketIdCount: response.data.filter(
      (ticket: unknown) => isRecord(ticket) && typeof ticket.id === "string",
    ).length,
    errorCodes: pushErrorCodesFromResponse(response),
  };
}

function pushReceiptSummary(response: unknown): PushReceiptSummary {
  if (!isRecord(response) || !isRecord(response.data)) {
    return {
      receiptCount: 0,
      okReceiptCount: 0,
      errorReceiptCount: 0,
      errorCodes: [],
    };
  }

  const receipts = Object.values(response.data);
  return {
    receiptCount: receipts.length,
    okReceiptCount: receipts.filter(
      (receipt: unknown) => isRecord(receipt) && receipt.status === "ok",
    ).length,
    errorReceiptCount: receipts.filter(
      (receipt: unknown) => isRecord(receipt) && receipt.status === "error",
    ).length,
    errorCodes: pushReceiptErrorCodesFromResponse(response),
  };
}

function emptyPushTicketSummary(): PushTicketSummary {
  return {
    ticketCount: 0,
    okTicketCount: 0,
    ticketIdCount: 0,
    errorCodes: [],
  };
}

function emptyPushReceiptSummary(): PushReceiptSummary {
  return {
    receiptCount: 0,
    okReceiptCount: 0,
    errorReceiptCount: 0,
    errorCodes: [],
  };
}

function ticketStatus(
  summary: PushTicketSummary,
): PushDiagnosticResult["expoTicketStatus"] {
  if (summary.ticketCount === 0) return "error";
  if (summary.okTicketCount === summary.ticketCount) return "ok";
  if (summary.okTicketCount === 0) return "error";
  return "partial";
}

export function buildIncomingCallPushPayload(
  token: string,
  call: Pick<CallDocument, "_id" | "type" | "callerId" | "calleeId">,
  caller: Pick<UserDocument, "displayName">,
): ExpoPushMessage {
  const callType: CallType = call.type;
  return {
    to: token,
    title: `Incoming ${callType} call`,
    body: `${caller.displayName} is calling you`,
    data: {
      type: "incoming_call",
      callId: call._id.toString(),
      callerId: call.callerId.toString(),
      callType,
    },
    sound: "default",
    priority: "high",
    channelId: "calls",
  };
}

export function invalidPushTokensFromResponse(
  tokens: string[],
  response: unknown,
): string[] {
  if (!isRecord(response) || !Array.isArray(response.data)) return [];
  return response.data.flatMap((ticket: unknown, index: number) => {
    return pushErrorCode(ticket) === "DeviceNotRegistered" &&
      tokens[index] !== undefined
      ? [tokens[index]]
      : [];
  });
}

function ticketTokenPairsFromResponse(
  tokens: string[],
  response: unknown,
): TicketTokenPair[] {
  if (!isRecord(response) || !Array.isArray(response.data)) return [];
  return response.data.flatMap((ticket: unknown, index: number) => {
    if (!isRecord(ticket) || typeof ticket.id !== "string") return [];
    const token = tokens[index];
    if (token === undefined || ticket.status !== "ok") return [];
    const parsedTicket: ExpoPushTicket = {
      status: "ok",
      id: ticket.id,
    };
    return parsedTicket.id === undefined
      ? []
      : [{ id: parsedTicket.id, token }];
  });
}

export function invalidPushTokensFromReceiptResponse(
  ticketTokens: ReadonlyMap<string, string>,
  response: unknown,
): string[] {
  if (!isRecord(response) || !isRecord(response.data)) return [];
  return Object.entries(response.data).flatMap(([ticketId, receipt]) => {
    const token = ticketTokens.get(ticketId);
    return pushErrorCode(receipt) === "DeviceNotRegistered" &&
      token !== undefined
      ? [token]
      : [];
  });
}

export function pushReceiptErrorCodesFromResponse(response: unknown): string[] {
  if (!isRecord(response) || !isRecord(response.data)) return [];
  return [
    ...new Set(
      Object.values(response.data)
        .map((receipt: unknown) => pushErrorCode(receipt))
        .filter((code): code is string => code !== null),
    ),
  ];
}

async function claimPush(key: string): Promise<boolean> {
  if (!redisClient.isReady) return true;
  const result = await redisClient.set(key, "1", {
    NX: true,
    EX: pushDeduplicationTtlSeconds,
  });
  return result === "OK";
}

async function releasePushClaim(key: string): Promise<void> {
  if (redisClient.isReady) await redisClient.del(key);
}

async function runPushOnce(
  key: string,
  operation: () => Promise<void>,
): Promise<boolean> {
  if (!(await claimPush(key))) return false;
  try {
    await operation();
    return true;
  } catch (error: unknown) {
    await releasePushClaim(key).catch(() => undefined);
    throw error;
  }
}

function pushHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.EXPO_ACCESS_TOKEN !== undefined) {
    headers.Authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`;
  }
  return headers;
}

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function processExpoReceipts(
  ticketTokens: TicketTokenPair[],
): Promise<PushReceiptResult> {
  if (ticketTokens.length === 0) {
    return { status: "error", summary: emptyPushReceiptSummary() };
  }

  try {
    const response = await fetch(env.EXPO_PUSH_RECEIPTS_URL, {
      method: "POST",
      headers: pushHeaders(),
      body: JSON.stringify({ ids: ticketTokens.map((ticket) => ticket.id) }),
      signal: AbortSignal.timeout(expoRequestTimeoutMs),
    });
    const body = await responseBody(response);
    const summary = pushReceiptSummary(body);
    logger.info(
      {
        event: "push.expo_receipt_response",
        httpStatus: response.status,
        requestAccepted: response.ok,
        ...summary,
      },
      "Expo push receipt response",
    );
    if (!response.ok) {
      logger.warn(
        { statusCode: response.status },
        "Expo push receipt request failed",
      );
      return { status: "error", summary };
    }

    const ticketMap = new Map(
      ticketTokens.map((ticket) => [ticket.id, ticket.token]),
    );
    await disablePushTokens(
      invalidPushTokensFromReceiptResponse(ticketMap, body),
    );
    const errorCodes = pushReceiptErrorCodesFromResponse(body);
    if (errorCodes.length > 0) {
      logger.warn(
        { errorCodes },
        "Expo push receipts reported delivery errors",
      );
    }

    const completeSuccess =
      summary.receiptCount === ticketTokens.length &&
      summary.okReceiptCount === summary.receiptCount;
    return { status: completeSuccess ? "ok" : "error", summary };
  } catch (error: unknown) {
    logger.warn({ err: error }, "Expo push receipt processing failed");
    return { status: "error", summary: emptyPushReceiptSummary() };
  }
}

function scheduleExpoReceiptCheck(ticketTokens: TicketTokenPair[]): void {
  if (ticketTokens.length === 0) return;
  const timer = setTimeout(() => {
    void processExpoReceipts(ticketTokens);
  }, expoReceiptDelayMs);
  timer.unref();
}

async function sendExpoBatch(
  messages: ExpoPushMessage[],
  options: ExpoBatchOptions = {},
): Promise<ExpoBatchResult> {
  if (messages.length === 0) {
    return { ticketSummary: emptyPushTicketSummary(), receipt: null };
  }
  const response = await fetch(env.EXPO_PUSH_API_URL, {
    method: "POST",
    headers: pushHeaders(),
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(expoRequestTimeoutMs),
  });
  const body = await responseBody(response);
  const summary = pushTicketSummary(body);
  logger.info(
    {
      event: "push.expo_ticket_response",
      httpStatus: response.status,
      requestAccepted: response.ok,
      attemptedDeviceCount: messages.length,
      ...summary,
    },
    "Expo push ticket response",
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
    await new Promise<void>((resolve) => {
      setTimeout(resolve, options.receiptDelayMs ?? expoReceiptDelayMs);
    });
    return {
      ticketSummary: summary,
      receipt: await processExpoReceipts(ticketTokens),
    };
  }

  scheduleExpoReceiptCheck(ticketTokens);
  return { ticketSummary: summary, receipt: null };
}

function deviceTokensFromMessages(messages: ExpoPushMessage[]): string[] {
  return messages.map((message) => message.to);
}

async function sendPushMessages(messages: ExpoPushMessage[]): Promise<void> {
  for (let index = 0; index < messages.length; index += expoBatchSize) {
    await sendExpoBatch(messages.slice(index, index + expoBatchSize));
  }
}

function buildDiagnosticPushPayload(token: string): ExpoPushMessage {
  return {
    to: token,
    title: "Terqivo Connect Test",
    body: "Push notifications are working.",
    data: { type: "diagnostic" },
    sound: "default",
    priority: "high",
    channelId: "messages",
  };
}

export async function sendDiagnosticPush(
  userId: string,
  options: Pick<ExpoBatchOptions, "receiptDelayMs"> = {},
): Promise<PushDiagnosticResult> {
  const devices = await getEnabledPushDevices(userId);
  logger.info(
    {
      event: "push.diagnostic_requested",
      recipientId: userId,
      activeDeviceCount: devices.length,
    },
    "Diagnostic push requested",
  );

  if (devices.length === 0) {
    return {
      activeDeviceCount: 0,
      expoTicketStatus: "not_sent",
      ticketIdPresent: false,
      expoReceiptStatus: "not_checked",
      receiptErrorCode: null,
    };
  }

  try {
    const batchOptions: ExpoBatchOptions = { waitForReceipt: true };
    if (options.receiptDelayMs !== undefined) {
      batchOptions.receiptDelayMs = options.receiptDelayMs;
    }
    const result = await sendExpoBatch(
      devices.map((device) => buildDiagnosticPushPayload(device.pushToken)),
      batchOptions,
    );
    return {
      activeDeviceCount: devices.length,
      expoTicketStatus: ticketStatus(result.ticketSummary),
      ticketIdPresent: result.ticketSummary.ticketIdCount > 0,
      expoReceiptStatus: result.receipt?.status ?? "not_checked",
      receiptErrorCode: result.receipt?.summary.errorCodes[0] ?? null,
    };
  } catch (error: unknown) {
    logger.warn(
      { event: "push.diagnostic_failed", recipientId: userId, err: error },
      "Diagnostic push delivery failed",
    );
    return {
      activeDeviceCount: devices.length,
      expoTicketStatus: "error",
      ticketIdPresent: false,
      expoReceiptStatus: "not_checked",
      receiptErrorCode: null,
    };
  }
}

export async function dispatchNewDirectMessage(
  input: MessagePushInput,
): Promise<void> {
  const deduplicationKey = `terqivo:push:message:${input.message.id}`;
  try {
    const dedupAccepted = await runPushOnce(deduplicationKey, async () => {
      const [devices, sender] = await Promise.all([
        getEnabledPushDevices(input.recipientId),
        getUserById(input.senderId),
      ]);
      logger.info(
        {
          event: "push.message_requested",
          recipientId: input.recipientId,
          activeDeviceCount: devices.length,
          dedupAccepted: true,
        },
        "Direct message push requested",
      );
      if (sender === null) return;
      await sendPushMessages(
        devices.map((device) =>
          buildMessagePushPayload(device.pushToken, {
            message: input.message,
            sender,
          }),
        ),
      );
    });
    if (!dedupAccepted) {
      logger.info(
        { event: "push.message_skipped", dedupAccepted: false },
        "Direct message push skipped as duplicate",
      );
    }
  } catch (error: unknown) {
    logger.warn({ err: error }, "Direct message push delivery failed");
  }
}

export async function dispatchIncomingCallNotification(
  call: CallDocument,
  caller: UserDocument,
): Promise<void> {
  const deduplicationKey = `terqivo:push:call:${call._id.toString()}`;
  try {
    const dedupAccepted = await runPushOnce(deduplicationKey, async () => {
      const devices = await getEnabledPushDevices(call.calleeId.toString());
      logger.info(
        {
          event: "push.incoming_call_requested",
          callId: call._id.toString(),
          recipientId: call.calleeId.toString(),
          activeDeviceCount: devices.length,
          dedupAccepted: true,
        },
        "Incoming call push requested",
      );
      await sendPushMessages(
        devices.map((device) =>
          buildIncomingCallPushPayload(device.pushToken, call, caller),
        ),
      );
    });
    if (!dedupAccepted) {
      logger.info(
        { event: "push.incoming_call_skipped", dedupAccepted: false },
        "Incoming call push skipped as duplicate",
      );
    }
  } catch (error: unknown) {
    logger.warn({ err: error }, "Incoming call push delivery failed");
  }
}

export async function dispatchMissedCallNotification(
  call: CallDocument,
): Promise<void> {
  const deduplicationKey = `terqivo:push:missed-call:${call._id.toString()}`;
  try {
    const dedupAccepted = await runPushOnce(deduplicationKey, async () => {
      const [devices, caller] = await Promise.all([
        getEnabledPushDevices(call.calleeId.toString()),
        getUserById(call.callerId.toString()),
      ]);
      logger.info(
        {
          event: "push.missed_call_requested",
          callId: call._id.toString(),
          recipientId: call.calleeId.toString(),
          activeDeviceCount: devices.length,
          dedupAccepted: true,
        },
        "Missed call push requested",
      );
      if (caller === null) return;
      await sendPushMessages(
        devices.map((device) =>
          buildMissedCallPushPayload(device.pushToken, call, caller),
        ),
      );
    });
    if (!dedupAccepted) {
      logger.info(
        { event: "push.missed_call_skipped", dedupAccepted: false },
        "Missed call push skipped as duplicate",
      );
    }
  } catch (error: unknown) {
    logger.warn({ err: error }, "Missed call push delivery failed");
  }
}
