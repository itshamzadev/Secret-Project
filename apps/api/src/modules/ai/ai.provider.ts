import { AppError } from "../../core/errors.js";
import { env } from "../../config/env.js";
import type { WebSearchResultDto } from "@terqivo/contracts";

export interface AiProviderInput {
  query: string;
  systemInstruction?: string;
  googleSearch?: boolean;
  signal?: AbortSignal;
}

export interface AiProviderResult {
  answer: string;
  providerModel: string;
  grounded?: boolean;
  sources?: WebSearchResultDto[];
}

export interface AiProvider {
  generate(input: AiProviderInput): Promise<AiProviderResult>;
  stream(input: AiProviderInput): AsyncGenerator<string, void, undefined>;
}

const requestTimeoutMs = 30_000;
let configuredGeminiProvider: GeminiProvider | null | undefined;

export class GeminiProvider implements AiProvider {
  public constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  public async generate(input: AiProviderInput): Promise<AiProviderResult> {
    const response = await this.request("generateContent", input);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw providerError("Gemini returned an invalid response.");
    }
    const answer = extractAnswer(body);
    if (answer === null) {
      throw providerError("Gemini returned an unusable response.");
    }
    const sources =
      input.googleSearch === true ? extractGroundingSources(body) : [];
    return {
      answer,
      providerModel: this.model,
      grounded: input.googleSearch === true && sources.length > 0,
      sources,
    };
  }

  public async *stream(
    input: AiProviderInput,
  ): AsyncGenerator<string, void, undefined> {
    const response = await this.request("streamGenerateContent?alt=sse", input);
    if (response.body === null) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw providerError("Gemini returned an invalid response.");
      }
      const answer = extractAnswer(body);
      if (answer !== null) yield answer;
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";
        for (const event of events) {
          const text = extractSseText(event);
          if (text !== null) yield text;
        }
        if (chunk.done) break;
      }
      const finalText = extractSseText(buffer);
      if (finalText !== null) yield finalText;
    } finally {
      reader.releaseLock();
    }
  }

  private async request(
    operation: "generateContent" | "streamGenerateContent?alt=sse",
    input: AiProviderInput,
  ): Promise<Response> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:${operation}`;
    let response: Response;
    try {
      const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
      const signal =
        input.signal === undefined
          ? timeoutSignal
          : AbortSignal.any([input.signal, timeoutSignal]);
      response = await this.fetchImpl(endpoint, {
        method: "POST",
        signal,
        headers: {
          accept: operation.startsWith("stream")
            ? "text/event-stream"
            : "application/json",
          "content-type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          ...(input.systemInstruction === undefined
            ? {}
            : {
                system_instruction: {
                  parts: [{ text: input.systemInstruction }],
                },
              }),
          contents: [{ role: "user", parts: [{ text: input.query }] }],
          ...(input.googleSearch === true
            ? { tools: [{ google_search: {} }] }
            : {}),
        }),
      });
    } catch {
      throw providerError("Gemini is temporarily unavailable.");
    }

    if (!response.ok) {
      throw providerError("Gemini is temporarily unavailable.");
    }
    return response;
  }
}

export class TerqivoAIProvider implements AiProvider {
  public constructor(
    private readonly gemini: AiProvider,
    private readonly systemInstruction: string,
  ) {}

  public generate(input: AiProviderInput): Promise<AiProviderResult> {
    return this.gemini.generate({
      ...input,
      systemInstruction: this.systemInstruction,
    });
  }

  public stream(
    input: AiProviderInput,
  ): AsyncGenerator<string, void, undefined> {
    return this.gemini.stream({
      ...input,
      systemInstruction: this.systemInstruction,
    });
  }
}

export function getConfiguredGeminiProvider(): GeminiProvider | null {
  if (configuredGeminiProvider !== undefined) return configuredGeminiProvider;
  configuredGeminiProvider =
    env.GEMINI_API_KEY === undefined
      ? null
      : new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL);
  return configuredGeminiProvider;
}

export function extractAnswer(value: unknown): string | null {
  const text = extractCandidateText(value);
  return text === null || text.trim().length === 0 ? null : text.trim();
}

function extractCandidateText(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return null;
  const candidate = value.candidates[0];
  if (
    !isRecord(candidate) ||
    !isRecord(candidate.content) ||
    !Array.isArray(candidate.content.parts)
  ) {
    return null;
  }
  const text = candidate.content.parts
    .map((part: unknown) =>
      isRecord(part) && typeof part.text === "string" ? part.text : "",
    )
    .join("");
  return text.length > 0 ? text : null;
}

function extractSseText(event: string): string | null {
  const data = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .join("");
  if (data.length === 0 || data === "[DONE]") return null;
  try {
    return extractCandidateText(JSON.parse(data) as unknown);
  } catch {
    return null;
  }
}

export function extractGroundingSources(value: unknown): WebSearchResultDto[] {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return [];
  const candidate = value.candidates[0];
  if (!isRecord(candidate)) return [];
  const metadata =
    getRecord(candidate.groundingMetadata) ??
    getRecord(candidate.grounding_metadata);
  if (metadata === null) return [];

  const chunks =
    getArray(metadata.groundingChunks) ?? getArray(metadata.grounding_chunks);
  if (chunks === null) return [];

  const sources = new Map<string, MutableGroundingSource>();
  const sourceKeyByChunkIndex = new Map<number, string>();
  chunks.forEach((chunk, index) => {
    if (!isRecord(chunk)) return;
    const web = getRecord(chunk.web) ?? getRecord(chunk.web_source);
    if (web === null) return;
    const url = safeHttpUrl(stringValue(web.uri) ?? stringValue(web.url));
    if (url === null) return;
    const source = sources.get(url) ?? { url };
    const title = stringValue(web.title);
    if (source.title === undefined && title !== null) source.title = title;
    sources.set(url, source);
    sourceKeyByChunkIndex.set(index, url);
  });

  const supports =
    getArray(metadata.groundingSupports) ??
    getArray(metadata.grounding_supports);
  supports?.forEach((support) => {
    if (!isRecord(support)) return;
    const segment = getRecord(support.segment);
    const snippet = segment === null ? null : stringValue(segment.text);
    if (snippet === null) return;
    const indices =
      getArray(support.groundingChunkIndices) ??
      getArray(support.grounding_chunk_indices);
    indices?.forEach((index) => {
      if (typeof index !== "number") return;
      const sourceKey = sourceKeyByChunkIndex.get(index);
      if (sourceKey === undefined) return;
      const source = sources.get(sourceKey);
      if (source !== undefined) source.snippet ??= snippet;
    });
  });

  return [...sources.values()].map((source) => {
    const result: WebSearchResultDto = {
      url: source.url,
      source: sourceLabel(source.title, source.url),
    };
    if (source.title !== undefined) result.title = source.title;
    if (source.snippet !== undefined) result.snippet = source.snippet;
    return result;
  });
}

interface MutableGroundingSource {
  url: string;
  title?: string;
  snippet?: string;
}

function sourceLabel(title: string | undefined, url: string): string {
  if (title !== undefined && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(title)) {
    return title;
  }
  return new URL(url).hostname;
}

function safeHttpUrl(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function getArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function providerError(message: string): AppError {
  return new AppError({
    code: "AI_PROVIDER_ERROR",
    message,
    statusCode: 502,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
