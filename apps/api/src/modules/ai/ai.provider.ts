import { AppError } from "../../core/errors.js";

export interface AiProviderInput {
  query: string;
  systemInstruction?: string;
  signal?: AbortSignal;
}

export interface AiProviderResult {
  answer: string;
  providerModel: string;
}

export interface AiProvider {
  generate(input: AiProviderInput): Promise<AiProviderResult>;
  stream(input: AiProviderInput): AsyncGenerator<string, void, undefined>;
}

const requestTimeoutMs = 30_000;

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
    return { answer, providerModel: this.model };
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
