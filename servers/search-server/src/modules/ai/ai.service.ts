import { createHash, randomUUID } from "node:crypto";
import { AppError } from "../../core/errors.js";
import { logger } from "../../logging/logger.js";
import { AiResponseCache } from "./ai.cache.js";
import { resolveLocalAiResponse } from "./ai.local.js";
import { PerConversationAiQueue } from "./ai.queue.js";
import { getConfiguredGeminiProvider, TerqivoAIProvider } from "./ai.provider.js";
import { shouldUseGoogleSearch } from "./ai.web-routing.js";
import { aiModelOptions, type AiModelId, type AiModelOptionsData, type AiProviderInput, type AiProviderResult, type AiResponseData, type AiProvider } from "./types.js";
import type { AiQueryInput } from "./ai.validation.js";

export interface AiRequestContext { userId: string; }
export interface AiStreamOptions { onChunk: (chunk: string) => void | Promise<void>; signal?: AbortSignal; }
export interface AiOrchestratorOptions { geminiProvider?: AiProvider | null; terqivoProvider?: AiProvider | null; cache?: AiResponseCache<string>; queue?: PerConversationAiQueue; now?: () => number; }
interface NormalizedRequest { query: string; modelId: AiModelId; requestId: string; conversationId: string; }
interface RequestEntry { fingerprint: string; promise: Promise<AiResponseData>; expiresAt: number; }
const idempotencyTtlMs = 10 * 60_000;
const maxIdempotencyEntries = 2_000;

export class AiOrchestrator {
  private readonly geminiProvider: AiProvider | null;
  private readonly terqivoProvider: AiProvider | null;
  private readonly cache: AiResponseCache<string>;
  private readonly queue: PerConversationAiQueue;
  private readonly now: () => number;
  private readonly requests = new Map<string, RequestEntry>();
  public constructor(options: AiOrchestratorOptions = {}) { this.now = options.now ?? Date.now; this.cache = options.cache ?? new AiResponseCache<string>(); this.queue = options.queue ?? new PerConversationAiQueue(); const provider = options.geminiProvider ?? getConfiguredGeminiProvider(); this.geminiProvider = provider; this.terqivoProvider = options.terqivoProvider ?? (provider === null ? null : new TerqivoAIProvider(provider)); }
  public listModels(): AiModelOptionsData { return { models: aiModelOptions }; }
  public answer(input: AiQueryInput, context: AiRequestContext): Promise<AiResponseData> { return this.process(input, context); }
  public stream(input: AiQueryInput, context: AiRequestContext, options: AiStreamOptions): Promise<AiResponseData> { const request = this.normalize(input); const key = `${context.userId}:${request.requestId}`; const existing = this.existing(key, request, context.userId); if (existing !== null) return existing.promise.then(async (result) => { await options.onChunk(result.answer); return result; }); const promise = this.enqueue(request, context, options); this.remember(key, request, context.userId, promise); return promise; }
  private process(input: AiQueryInput, context: AiRequestContext): Promise<AiResponseData> { const request = this.normalize(input); const key = `${context.userId}:${request.requestId}`; const existing = this.existing(key, request, context.userId); if (existing !== null) return existing.promise; const promise = this.enqueue(request, context); this.remember(key, request, context.userId, promise); return promise; }
  private enqueue(request: NormalizedRequest, context: AiRequestContext, stream?: AiStreamOptions): Promise<AiResponseData> { const started = this.now(); const key = `${context.userId}:${request.conversationId}`; logger.info({ requestId: request.requestId, conversationId: request.conversationId, status: "queued" }, "AI request queued"); return this.queue.run(key, async () => { try { const result = await this.execute(request, stream); logger.info({ requestId: request.requestId, conversationId: request.conversationId, route: result.route, status: result.state, totalMs: this.now() - started }, "AI request completed"); return result; } catch (error) { logger.warn({ err: error, requestId: request.requestId, conversationId: request.conversationId }, "AI request failed"); throw error; } }); }
  private async execute(request: NormalizedRequest, stream?: AiStreamOptions): Promise<AiResponseData> {
    if (stream?.signal?.aborted === true) throw new AppError({ code: "AI_REQUEST_CANCELLED", message: "The AI request was cancelled.", statusCode: 499 });
    if (request.modelId === "terqivo-ai") { const local = resolveLocalAiResponse(request.query); if (local !== null) { const cached = this.cache.get(`local:${local.cacheKey}`); const answer = cached ?? local.answer; if (cached === null) this.cache.set(`local:${local.cacheKey}`, answer); await stream?.onChunk(answer); return responseFor(request, answer, "local"); } }
    const provider = request.modelId === "terqivo-ai" ? this.terqivoProvider : this.geminiProvider;
    if (provider === null) throw new AppError({ code: "AI_NOT_CONFIGURED", message: "Terqivo AI is not configured yet.", statusCode: 503 });
    const input: AiProviderInput = { query: request.query, googleSearch: request.modelId === "terqivo-ai" && shouldUseGoogleSearch(request.query) }; if (stream?.signal !== undefined) input.signal = stream.signal;
    let answer = ""; let providerResult: AiProviderResult | undefined;
    if (stream === undefined) { const generated = await provider.generate(input); providerResult = generated; answer = generated.answer; } else { for await (const chunk of provider.stream(input)) { if (chunk.length === 0) continue; answer += chunk; await stream.onChunk(chunk); } }
    if (answer.trim() === "") throw new AppError({ code: "AI_PROVIDER_ERROR", message: "Terqivo AI returned an unusable response.", statusCode: 502 });
    return responseFor(request, answer.trim(), "gemini", providerResult);
  }
  private normalize(input: AiQueryInput): NormalizedRequest { return { query: input.query, modelId: input.modelId ?? "terqivo-ai", requestId: input.requestId ?? randomUUID(), conversationId: input.conversationId ?? "ai-assistant" }; }
  private existing(key: string, request: NormalizedRequest, userId: string): RequestEntry | null { const entry = this.requests.get(key); if (entry === undefined) return null; if (entry.expiresAt <= this.now()) { this.requests.delete(key); return null; } if (entry.fingerprint !== fingerprint(request, userId)) throw new AppError({ code: "AI_REQUEST_ID_REUSED", message: "This AI request id is already associated with another request.", statusCode: 409 }); return entry; }
  private remember(key: string, request: NormalizedRequest, userId: string, promise: Promise<AiResponseData>): void { const now = this.now(); for (const [oldKey, entry] of this.requests) if (entry.expiresAt <= now) this.requests.delete(oldKey); while (this.requests.size >= maxIdempotencyEntries) { const oldest = this.requests.keys().next().value; if (oldest === undefined) break; this.requests.delete(oldest); } this.requests.set(key, { fingerprint: fingerprint(request, userId), promise, expiresAt: now + idempotencyTtlMs }); }
}

function responseFor(request: NormalizedRequest, answer: string, route: AiResponseData["route"], provider?: { grounded?: boolean; sources?: AiProviderResult["sources"] }): AiResponseData { const result: AiResponseData = { answer, model: request.modelId, grounded: provider?.grounded ?? false, route, requestId: request.requestId, state: "completed" }; if (provider?.sources !== undefined && provider.sources.length > 0) result.sources = provider.sources.map(({ title, url }) => title === undefined ? { url } : { title, url }); return result; }
function fingerprint(request: NormalizedRequest, userId: string): string { return createHash("sha256").update(userId).update("\0").update(request.query).update("\0").update(request.modelId).update("\0").update(request.conversationId).digest("hex"); }
