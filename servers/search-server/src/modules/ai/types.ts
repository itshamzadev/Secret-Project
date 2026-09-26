import type { WebSearchResultDto } from "../search/types.js";

export const aiModelIds = ["gemini-native-audio", "gemini-flash", "terqivo-ai"] as const;
export type AiModelId = (typeof aiModelIds)[number];
export interface AiModelOption { id: AiModelId; label: string; description: string; }
export const aiModelOptions: readonly AiModelOption[] = [
  { id: "gemini-native-audio", label: "Gemini Native Audio", description: "Gemini's native audio-capable model." },
  { id: "gemini-flash", label: "Gemini Flash", description: "Fast Gemini responses for everyday questions." },
  { id: "terqivo-ai", label: "Terqivo AI", description: "Terqivo's optimized assistant orchestration layer." },
];
export interface AiModelOptionsData { models: readonly AiModelOption[]; }
export interface AiQuery { query: string; modelId?: AiModelId; requestId?: string; conversationId?: string; }
export interface AiResponseData { answer: string; model: AiModelId; grounded: boolean; route: "local" | "gemini" | "child"; requestId: string; state: "completed"; sources?: Array<Pick<WebSearchResultDto, "title" | "url">>; }
export interface AiProviderInput { query: string; systemInstruction?: string; googleSearch?: boolean; signal?: AbortSignal; }
export interface AiProviderResult { answer: string; providerModel: string; grounded?: boolean; sources?: WebSearchResultDto[]; }
export interface AiProvider { generate(input: AiProviderInput): Promise<AiProviderResult>; stream(input: AiProviderInput): AsyncGenerator<string, void, undefined>; }
