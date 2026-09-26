import { env } from "../../config/env.js";
import { logger } from "../../logging/logger.js";
import type { ExpoDeliveryResult, ExpoReceiptSummary, ExpoTicketSummary, NotificationProvider } from "./notification.types.js";

type ExpoMessage = Parameters<NotificationProvider["send"]>[0][number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorCode(value: unknown): string | null {
  if (!isRecord(value) || value.status !== "error") return null;
  const details = isRecord(value.details) ? value.details : undefined;
  return typeof details?.error === "string" ? details.error : null;
}

function ticketSummary(body: unknown): ExpoTicketSummary {
  if (!isRecord(body) || !Array.isArray(body.data)) return { ticketCount: 0, okTicketCount: 0, ticketIdCount: 0, errorCodes: [] };
  return {
    ticketCount: body.data.length,
    okTicketCount: body.data.filter((item) => isRecord(item) && item.status === "ok").length,
    ticketIdCount: body.data.filter((item) => isRecord(item) && typeof item.id === "string").length,
    errorCodes: [...new Set(body.data.map(errorCode).filter((value): value is string => value !== null))],
  };
}

function receiptSummary(body: unknown): ExpoReceiptSummary {
  if (!isRecord(body) || !isRecord(body.data)) return { receiptCount: 0, okReceiptCount: 0, errorReceiptCount: 0, errorCodes: [] };
  const receipts = Object.values(body.data);
  return {
    receiptCount: receipts.length,
    okReceiptCount: receipts.filter((item) => isRecord(item) && item.status === "ok").length,
    errorReceiptCount: receipts.filter((item) => isRecord(item) && item.status === "error").length,
    errorCodes: [...new Set(receipts.map(errorCode).filter((value): value is string => value !== null))],
  };
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

function headers(): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(env.EXPO_ACCESS_TOKEN === undefined ? {} : { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` }),
  };
}

function ticketIds(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.data)) return [];
  return body.data.filter((item): item is Record<string, unknown> => isRecord(item) && typeof item.id === "string").map((item) => item.id as string);
}

function invalidTokens(body: unknown, messages: ExpoMessage[]): string[] {
  if (!isRecord(body) || !Array.isArray(body.data)) return [];
  return body.data.flatMap((item, index) => errorCode(item) === "DeviceNotRegistered" ? [messages[index]?.to].filter((value): value is string => value !== undefined) : []);
}

async function waitForReceipt(ids: string[], tokensByTicketId: Map<string, string>): Promise<{ status: "ok" | "error"; summary: ExpoReceiptSummary; invalidTokens: string[] }> {
  if (ids.length === 0) return { status: "error", summary: { receiptCount: 0, okReceiptCount: 0, errorReceiptCount: 0, errorCodes: [] }, invalidTokens: [] };
  if (env.PUSH_RECEIPT_DELAY_MS > 0) await new Promise<void>((resolve) => setTimeout(resolve, env.PUSH_RECEIPT_DELAY_MS));
  try {
    const response = await fetch(env.EXPO_PUSH_RECEIPTS_URL, { method: "POST", headers: headers(), body: JSON.stringify({ ids }), signal: AbortSignal.timeout(10000) });
    const body = await readJson(response);
    const summary = receiptSummary(body);
    const complete = response.ok && summary.receiptCount === ids.length && summary.okReceiptCount === ids.length;
    const invalidTokens = isRecord(body) && isRecord(body.data)
      ? Object.entries(body.data).flatMap(([id, receipt]) => errorCode(receipt) === "DeviceNotRegistered" && tokensByTicketId.has(id) ? [tokensByTicketId.get(id) as string] : [])
      : [];
    return { status: complete ? "ok" : "error", summary, invalidTokens };
  } catch (error: unknown) {
    logger.warn({ err: error }, "Expo receipt request failed");
    return { status: "error", summary: { receiptCount: 0, okReceiptCount: 0, errorReceiptCount: 0, errorCodes: [] }, invalidTokens: [] };
  }
}

export class ExpoPushProvider implements NotificationProvider {
  async send(messages: ExpoMessage[], options: { waitForReceipt?: boolean } = {}): Promise<ExpoDeliveryResult> {
    if (messages.length === 0) {
      return { ticketSummary: { ticketCount: 0, okTicketCount: 0, ticketIdCount: 0, errorCodes: [] }, receiptStatus: "not_checked", receiptSummary: null, ticketIds: [], invalidTokens: [] };
    }
    const results: ExpoDeliveryResult[] = [];
    for (let offset = 0; offset < messages.length; offset += 100) {
      results.push(await this.sendBatch(messages.slice(offset, offset + 100), options));
    }
    return {
      ticketSummary: {
        ticketCount: results.reduce((total, result) => total + result.ticketSummary.ticketCount, 0),
        okTicketCount: results.reduce((total, result) => total + result.ticketSummary.okTicketCount, 0),
        ticketIdCount: results.reduce((total, result) => total + result.ticketSummary.ticketIdCount, 0),
        errorCodes: [...new Set(results.flatMap((result) => result.ticketSummary.errorCodes))],
      },
      receiptStatus: results.every((result) => result.receiptStatus === "ok") ? "ok" : results.some((result) => result.receiptStatus === "error") ? "error" : "not_checked",
      receiptSummary: results.some((result) => result.receiptSummary !== null) ? {
        receiptCount: results.reduce((total, result) => total + (result.receiptSummary?.receiptCount ?? 0), 0),
        okReceiptCount: results.reduce((total, result) => total + (result.receiptSummary?.okReceiptCount ?? 0), 0),
        errorReceiptCount: results.reduce((total, result) => total + (result.receiptSummary?.errorReceiptCount ?? 0), 0),
        errorCodes: [...new Set(results.flatMap((result) => result.receiptSummary?.errorCodes ?? []))],
      } : null,
      ticketIds: results.flatMap((result) => result.ticketIds),
      invalidTokens: [...new Set(results.flatMap((result) => result.invalidTokens))],
    };
  }

  private async sendBatch(messages: ExpoMessage[], options: { waitForReceipt?: boolean }): Promise<ExpoDeliveryResult> {
    const response = await fetch(env.EXPO_PUSH_API_URL, { method: "POST", headers: headers(), body: JSON.stringify(messages), signal: AbortSignal.timeout(10000) });
    const body = await readJson(response);
    if (!response.ok) throw new Error(`Expo push service returned HTTP ${response.status}.`);
    const summary = ticketSummary(body);
    const ids = ticketIds(body);
    const invalid = invalidTokens(body, messages);
    if (summary.errorCodes.length > 0) logger.warn({ event: "push.expo_ticket_errors", errorCodes: summary.errorCodes }, "Expo push tickets reported errors");
    if (options.waitForReceipt !== true) {
      return { ticketSummary: summary, receiptStatus: "not_checked", receiptSummary: null, ticketIds: ids, invalidTokens: invalid };
    }
    const tokensByTicketId = new Map(ids.map((id, index) => [id, messages[index]?.to]).filter((entry): entry is [string, string] => entry[1] !== undefined));
    const receipt = await waitForReceipt(ids, tokensByTicketId);
    return { ticketSummary: summary, receiptStatus: receipt.status, receiptSummary: receipt.summary, ticketIds: ids, invalidTokens: [...new Set([...invalid, ...receipt.invalidTokens])] };
  }
}
