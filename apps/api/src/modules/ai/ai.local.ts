export interface LocalAiResponse {
  answer: string;
  cacheKey: string;
}

export function resolveLocalAiResponse(query: string): LocalAiResponse | null {
  const normalized = normalizeLocalQuery(query);
  if (normalized === "") return null;

  if (/^(hi|hello|hey|salam|assalam o alaikum)[!. ]*$/i.test(normalized)) {
    return { answer: "Hello! How can I help?", cacheKey: "greeting" };
  }
  if (/^(thanks|thank you|thx)[!. ]*$/i.test(normalized)) {
    return { answer: "You're welcome!", cacheKey: "thanks" };
  }
  if (normalized === "what is terqivo ai" || normalized === "who are you") {
    return {
      answer:
        "Terqivo AI is Terqivo Connect's optimized orchestration layer for fast, reliable assistant responses, backed by Gemini when deeper reasoning is needed.",
      cacheKey: "identity",
    };
  }
  if (normalized === "what can you do") {
    return {
      answer:
        "I can answer questions, explain concepts, and help you use Terqivo Connect. Ask me anything specific.",
      cacheKey: "capabilities",
    };
  }
  return null;
}

export function normalizeLocalQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
