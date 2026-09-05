import { createHash, randomUUID } from "node:crypto";

import type {
  AiModelOptionsData,
  AiModelId,
  AiResponseData,
} from "@terqivo/contracts";
import { aiModelOptions } from "@terqivo/contracts";

import { AppError } from "../../core/errors.js";
import { logger } from "../../lib/logger.js";
import { AiResponseCache } from "./ai.cache.js";
import { resolveLocalAiResponse } from "./ai.local.js";
import { PerConversationAiQueue } from "./ai.queue.js";
import {
  getConfiguredGeminiProvider,
  TerqivoAIProvider,
  type AiProviderInput,
  type AiProvider,
  type AiProviderResult,
} from "./ai.provider.js";
import { shouldUseGoogleSearch } from "./ai.web-routing.js";
import { terqivoSystemPrompt } from "./terqivo/system-prompt.js";
import type { AiQuery } from "./ai.validation.js";

export interface AiRequestContext {
  userId: string;
}

export interface AiMetrics {
  acceptedRequests: number;
  completedRequests: number;
  failedRequests: number;
  droppedRequests: number;
}

export interface AiStreamOptions {
  onChunk: (chunk: string) => void | Promise<void>;
  signal?: AbortSignal;
}

export interface AiOrchestratorOptions {
  geminiProvider?: AiProvider;
  terqivoProvider?: AiProvider;
  cache?: AiResponseCache<string>;
  queue?: PerConversationAiQueue;
  now?: () => number;
}

interface NormalizedRequest {
  query: string;
  modelId: AiModelId;
  requestId: string;
  conversationId: string;
}

interface RequestEntry {
  fingerprint: string;
  promise: Promise<AiResponseData>;
  expiresAt: number;
}

interface ExecutionResult {
  response: AiResponseData;
  providerTTFTMs: number;
}

const idempotencyTtlMs = 10 * 60_000;
const maxIdempotencyEntries = 2_000;
const defaultConversationId = "ai-assistant";

export class AiOrchestrator {
  private readonly geminiProvider: AiProvider | null;
  private readonly terqivoProvider: AiProvider | null;
  private readonly cache: AiResponseCache<string>;
  private readonly queue: PerConversationAiQueue;
  private readonly now: () => number;
  private readonly requests = new Map<string, RequestEntry>();
  private readonly metrics: AiMetrics = {
    acceptedRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    droppedRequests: 0,
  };

  public constructor(options: AiOrchestratorOptions = {}) {
    this.now = options.now ?? Date.now;
    this.cache = options.cache ?? new AiResponseCache<string>();
    this.queue = options.queue ?? new PerConversationAiQueue();

    const defaultProvider =
      options.geminiProvider ?? getConfiguredGeminiProvider();
    this.geminiProvider = defaultProvider;
    this.terqivoProvider =
      options.terqivoProvider ??
      (defaultProvider === null
        ? null
        : new TerqivoAIProvider(defaultProvider, terqivoSystemPrompt));
  }

  public listModels(): AiModelOptionsData {
    return { models: aiModelOptions };
  }

  public answer(
    input: AiQuery,
    context: AiRequestContext,
  ): Promise<AiResponseData> {
    return this.process(input, context);
  }

  public stream(
    input: AiQuery,
    context: AiRequestContext,
    options: AiStreamOptions,
  ): Promise<AiResponseData> {
    const request = this.normalizeRequest(input);
    const requestKey = `${context.userId}:${request.requestId}`;
    let existing: RequestEntry | null;
    try {
      existing = this.getRequest(requestKey, request, context.userId);
    } catch (error: unknown) {
      return Promise.reject(error);
    }
    if (existing !== null) {
      return existing.promise.then(async (result) => {
        await options.onChunk(result.answer);
        return result;
      });
    }

    const promise = this.enqueue(request, context, options);
    this.metrics.acceptedRequests += 1;
    this.rememberRequest(requestKey, request, context.userId, promise);
    return promise;
  }

  private process(
    input: AiQuery,
    context: AiRequestContext,
  ): Promise<AiResponseData> {
    const request = this.normalizeRequest(input);
    const requestKey = `${context.userId}:${request.requestId}`;
    let existing: RequestEntry | null;
    try {
      existing = this.getRequest(requestKey, request, context.userId);
    } catch (error: unknown) {
      return Promise.reject(error);
    }
    if (existing !== null) return existing.promise;

    const promise = this.enqueue(request, context);
    this.metrics.acceptedRequests += 1;
    this.rememberRequest(requestKey, request, context.userId, promise);
    return promise;
  }

  private enqueue(
    request: NormalizedRequest,
    context: AiRequestContext,
    streamOptions?: AiStreamOptions,
  ): Promise<AiResponseData> {
    const queuedAt = this.now();
    const queueKey = `${context.userId}:${request.conversationId}`;
    const logRoute =
      request.modelId === "terqivo-ai" &&
      resolveLocalAiResponse(request.query) !== null
        ? "local"
        : "gemini";
    logger.info(
      {
        requestId: request.requestId,
        conversationId: request.conversationId,
        route: logRoute,
        status: "queued",
        queueDelayMs: 0,
      },
      "AI request queued",
    );
    return this.queue.run(queueKey, async () => {
      const queueDelayMs = Math.max(0, this.now() - queuedAt);
      const route = request.modelId === "terqivo-ai" ? "terqivo" : "gemini";
      logger.info(
        {
          requestId: request.requestId,
          conversationId: request.conversationId,
          route: logRoute,
          status: "processing",
          queueDelayMs,
        },
        "AI request processing",
      );
      try {
        const execution = await this.execute(
          request,
          route,
          streamOptions,
          queueDelayMs,
        );
        const result = execution.response;
        logger.info(
          {
            requestId: request.requestId,
            conversationId: request.conversationId,
            route: result.route,
            status: result.state,
            queueDelayMs,
            providerTTFTMs: execution.providerTTFTMs,
            totalMs: Math.max(0, this.now() - queuedAt),
          },
          "AI request completed",
        );
        this.metrics.completedRequests += 1;
        return result;
      } catch (error: unknown) {
        logger.warn(
          {
            requestId: request.requestId,
            conversationId: request.conversationId,
            route: logRoute,
            status: "failed",
            queueDelayMs,
            totalMs: Math.max(0, this.now() - queuedAt),
          },
          "AI request failed",
        );
        this.metrics.failedRequests += 1;
        throw error;
      }
    });
  }

  private async execute(
    request: NormalizedRequest,
    route: "terqivo" | "gemini",
    streamOptions?: AiStreamOptions,
    queueDelayMs = 0,
  ): Promise<ExecutionResult> {
    if (streamOptions?.signal?.aborted === true) {
      throw new AppError({
        code: "AI_REQUEST_CANCELLED",
        message: "The AI request was cancelled.",
        statusCode: 499,
      });
    }
    if (route === "terqivo") {
      const local = resolveLocalAiResponse(request.query);
      if (local !== null) {
        const cached = this.cache.get(`local:${local.cacheKey}`);
        const answer = cached ?? local.answer;
        if (cached === null) this.cache.set(`local:${local.cacheKey}`, answer);
        await streamOptions?.onChunk(answer);
        return {
          response: createResponse(request, answer, "local"),
          providerTTFTMs: 0,
        };
      }
    }

    const provider =
      route === "terqivo" ? this.terqivoProvider : this.geminiProvider;
    if (provider === null) {
      throw new AppError({
        code: "AI_NOT_CONFIGURED",
        message: "Terqivo AI is not configured yet.",
        statusCode: 503,
      });
    }

    const providerStartedAt = this.now();
    const googleSearch =
      route === "terqivo" && shouldUseGoogleSearch(request.query);
    let firstChunkAt: number | null = null;
    let answer = "";
    let providerResult: AiProviderResult | undefined;
    if (streamOptions === undefined) {
      providerResult = await provider.generate({
        query: request.query,
        googleSearch,
      });
      answer = providerResult.answer;
    } else {
      const providerInput: AiProviderInput = {
        query: request.query,
        googleSearch,
      };
      if (streamOptions.signal !== undefined)
        providerInput.signal = streamOptions.signal;
      for await (const chunk of provider.stream(providerInput)) {
        if (chunk.length === 0) continue;
        if (firstChunkAt === null) {
          firstChunkAt = this.now();
          logger.info(
            {
              requestId: request.requestId,
              conversationId: request.conversationId,
              route: route === "terqivo" ? "gemini" : route,
              status: "streaming",
              queueDelayMs,
              providerTTFTMs: Math.max(0, firstChunkAt - providerStartedAt),
            },
            "AI response streaming",
          );
        }
        answer += chunk;
        await streamOptions.onChunk(chunk);
      }
    }

    const normalizedAnswer = answer.trim();
    if (normalizedAnswer.length === 0) {
      throw new AppError({
        code: "AI_PROVIDER_ERROR",
        message: "Terqivo AI returned an unusable response.",
        statusCode: 502,
      });
    }
    return {
      response: createResponse(
        request,
        normalizedAnswer,
        "gemini",
        providerResult,
      ),
      providerTTFTMs: Math.max(
        0,
        (firstChunkAt ?? this.now()) - providerStartedAt,
      ),
    };
  }

  private normalizeRequest(input: AiQuery): NormalizedRequest {
    return {
      query: input.query,
      modelId: input.modelId ?? "terqivo-ai",
      requestId: input.requestId ?? randomUUID(),
      conversationId: input.conversationId ?? defaultConversationId,
    };
  }

  public getMetrics(): Readonly<AiMetrics> {
    return { ...this.metrics };
  }

  private rememberRequest(
    requestKey: string,
    request: NormalizedRequest,
    userId: string,
    promise: Promise<AiResponseData>,
  ): void {
    const now = this.now();
    for (const [key, entry] of this.requests) {
      if (entry.expiresAt <= now) this.requests.delete(key);
    }
    while (this.requests.size >= maxIdempotencyEntries) {
      const oldest = this.requests.keys().next().value;
      if (oldest === undefined) break;
      this.requests.delete(oldest);
    }
    this.requests.set(requestKey, {
      fingerprint: fingerprint(request, userId),
      promise,
      expiresAt: now + idempotencyTtlMs,
    });
  }

  private getRequest(
    requestKey: string,
    request: NormalizedRequest,
    userId: string,
  ): RequestEntry | null {
    const existing = this.requests.get(requestKey);
    if (existing === undefined) return null;
    if (existing.expiresAt <= this.now()) {
      this.requests.delete(requestKey);
      return null;
    }
    if (existing.fingerprint !== fingerprint(request, userId)) {
      throw new AppError({
        code: "AI_REQUEST_ID_REUSED",
        message:
          "This AI request id is already associated with another request.",
        statusCode: 409,
      });
    }
    return existing;
  }
}

function createResponse(
  request: NormalizedRequest,
  answer: string,
  route: AiResponseData["route"],
  providerResult?: {
    grounded?: boolean;
    sources?: AiResponseData["sources"];
  },
): AiResponseData {
  const response: AiResponseData = {
    answer,
    model: request.modelId,
    grounded: providerResult?.grounded ?? false,
    route,
    requestId: request.requestId,
    state: "completed",
  };
  if (
    providerResult?.sources !== undefined &&
    providerResult.sources.length > 0
  ) {
    response.sources = providerResult.sources.map(({ title, url }) =>
      title === undefined ? { url } : { title, url },
    );
  }
  return response;
}

function fingerprint(request: NormalizedRequest, userId: string): string {
  return createHash("sha256")
    .update(userId)
    .update("\0")
    .update(request.query)
    .update("\0")
    .update(request.modelId)
    .update("\0")
    .update(request.conversationId)
    .digest("hex");
}

export const aiOrchestrator = new AiOrchestrator();

export function answerAiQuery(
  query: AiQuery,
  userId = "legacy-user",
): Promise<AiResponseData> {
  return aiOrchestrator.answer(query, { userId });
}

export function listAiModels(): AiModelOptionsData {
  return aiOrchestrator.listModels();
}

export function getAiMetrics(): Readonly<AiMetrics> {
  return aiOrchestrator.getMetrics();
}
