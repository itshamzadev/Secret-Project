import type { AiResponseData } from "@terqivo/contracts";

import { env } from "../../config/env.js";
import { AppError } from "../../core/errors.js";
import type { AiQuery } from "./ai.validation.js";

const requestTimeoutMs = 30_000;

export async function answerAiQuery(query: AiQuery): Promise<AiResponseData> {
  if (env.GEMINI_API_KEY === undefined) {
    throw new AppError({
      code: "AI_NOT_CONFIGURED",
      message: "Terqivo AI is not configured yet.",
      statusCode: 503,
    });
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(requestTimeoutMs),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: query.query }] }],
      }),
    });
  } catch {
    throw new AppError({
      code: "AI_PROVIDER_ERROR",
      message: "Terqivo AI is temporarily unavailable.",
      statusCode: 502,
    });
  }

  if (!response.ok) {
    throw new AppError({
      code: "AI_PROVIDER_ERROR",
      message: "Terqivo AI is temporarily unavailable.",
      statusCode: 502,
    });
  }

  const body: unknown = await response.json();
  const answer = extractAnswer(body);
  if (answer === null) {
    throw new AppError({
      code: "AI_PROVIDER_ERROR",
      message: "Terqivo AI returned an unusable response.",
      statusCode: 502,
    });
  }
  return { answer, model: env.GEMINI_MODEL, grounded: false };
}

function extractAnswer(value: unknown): string | null {
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
    .join("")
    .trim();
  return text.length > 0 ? text : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
