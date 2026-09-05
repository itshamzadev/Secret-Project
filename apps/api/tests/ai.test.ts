import { describe, expect, it } from "vitest";

import type {
  AiProvider,
  AiProviderInput,
  AiProviderResult,
} from "../src/modules/ai/ai.provider.js";
import { AiOrchestrator } from "../src/modules/ai/ai.service.js";
import { aiModelOptions } from "@terqivo/contracts";

class TestProvider implements AiProvider {
  public generateCalls = 0;
  public streamCalls = 0;
  public readonly inputs: AiProviderInput[] = [];
  public fail = false;

  public async generate(input: AiProviderInput): Promise<AiProviderResult> {
    this.generateCalls += 1;
    this.inputs.push(input);
    if (this.fail) throw new Error("provider failed");
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
    return { answer: `answer:${input.query}`, providerModel: "test-model" };
  }

  public async *stream(
    input: AiProviderInput,
  ): AsyncGenerator<string, void, undefined> {
    this.streamCalls += 1;
    this.inputs.push(input);
    if (this.fail) throw new Error("provider failed");
    yield `answer:${input.query.slice(0, 3)}`;
    yield input.query.slice(3);
  }
}

function createOrchestrator(provider = new TestProvider()): {
  orchestrator: AiOrchestrator;
  provider: TestProvider;
} {
  return {
    orchestrator: new AiOrchestrator({
      geminiProvider: provider,
      terqivoProvider: provider,
    }),
    provider,
  };
}

describe("Terqivo AI orchestration", () => {
  it("exposes Terqivo AI as a selectable model", () => {
    expect(aiModelOptions.some((option) => option.id === "terqivo-ai")).toBe(
      true,
    );
  });

  it("answers deterministic requests locally without a Gemini provider", async () => {
    const orchestrator = new AiOrchestrator();
    const result = await orchestrator.answer(
      { query: "hello", requestId: "local-request-1" },
      { userId: "user-1" },
    );
    expect(result.route).toBe("local");
    expect(result.answer).toBe("Hello! How can I help?");
  });

  it("does not invoke Google Search for a local greeting", async () => {
    const { orchestrator, provider } = createOrchestrator();
    const result = await orchestrator.answer(
      { query: "hello", requestId: "local-search-request-1" },
      { userId: "user-1" },
    );

    expect(result.route).toBe("local");
    expect(provider.generateCalls).toBe(0);
    expect(provider.inputs).toHaveLength(0);
  });

  it("enables Google Search for fresh Terqivo AI questions", async () => {
    const { orchestrator, provider } = createOrchestrator();
    const result = await orchestrator.answer(
      {
        query: "What is the latest Android version?",
        requestId: "current-search-request-1",
      },
      { userId: "user-1" },
    );

    expect(result.route).toBe("gemini");
    expect(provider.inputs[0]?.googleSearch).toBe(true);
  });

  it("enables Google Search for an explicit Google search request", async () => {
    const { orchestrator, provider } = createOrchestrator();
    await orchestrator.answer(
      {
        query: "Search Google for current Android news",
        requestId: "explicit-search-request-1",
      },
      { userId: "user-1" },
    );

    expect(provider.inputs[0]?.googleSearch).toBe(true);
  });

  it("routes complex Terqivo AI requests through the provider", async () => {
    const { orchestrator, provider } = createOrchestrator();
    const result = await orchestrator.answer(
      { query: "Explain how queues work.", requestId: "complex-request-1" },
      { userId: "user-1" },
    );
    expect(result.route).toBe("gemini");
    expect(result.model).toBe("terqivo-ai");
    expect(result).not.toHaveProperty("providerModel");
    expect(provider.generateCalls).toBe(1);
  });

  it("serializes ten rapid requests without dropping any", async () => {
    const { orchestrator, provider } = createOrchestrator();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        orchestrator.answer(
          { query: `Question ${index}`, requestId: `rapid-request-${index}` },
          { userId: "user-1" },
        ),
      ),
    );
    expect(results).toHaveLength(10);
    expect(new Set(results.map((result) => result.requestId)).size).toBe(10);
    expect(provider.generateCalls).toBe(10);
  });

  it("passes a fifty-request reliability stress test", async () => {
    const { orchestrator, provider } = createOrchestrator();
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        orchestrator.answer(
          {
            query: `Stress question ${index}`,
            requestId: `stress-request-${index}`,
          },
          { userId: "user-1" },
        ),
      ),
    );
    const completed = results.filter((result) => result.state === "completed");
    expect(results).toHaveLength(50);
    expect(completed).toHaveLength(50);
    expect(provider.generateCalls).toBe(50);
    expect(orchestrator.getMetrics()).toMatchObject({
      acceptedRequests: 50,
      completedRequests: 50,
      droppedRequests: 0,
    });
  });

  it("does not generate twice when the same request is retried", async () => {
    const { orchestrator, provider } = createOrchestrator();
    const first = orchestrator.answer(
      { query: "same request", requestId: "duplicate-request-1" },
      { userId: "user-1" },
    );
    const second = orchestrator.answer(
      { query: "same request", requestId: "duplicate-request-1" },
      { userId: "user-1" },
    );
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.answer).toBe(secondResult.answer);
    expect(provider.generateCalls).toBe(1);
  });

  it("never deduplicates different messages", async () => {
    const { orchestrator, provider } = createOrchestrator();
    await Promise.all([
      orchestrator.answer(
        { query: "first message", requestId: "different-request-1" },
        { userId: "user-1" },
      ),
      orchestrator.answer(
        { query: "second message", requestId: "different-request-2" },
        { userId: "user-1" },
      ),
    ]);
    expect(provider.generateCalls).toBe(2);
  });

  it("streams chunks and remains usable after a provider failure", async () => {
    const provider = new TestProvider();
    const { orchestrator } = createOrchestrator(provider);
    const chunks: string[] = [];
    const streamed = await orchestrator.stream(
      { query: "stream this answer", requestId: "stream-request-1" },
      { userId: "user-1" },
      {
        onChunk: (chunk) => {
          chunks.push(chunk);
        },
      },
    );
    expect(streamed.state).toBe("completed");
    expect(chunks.join("")).toBe(streamed.answer);

    provider.fail = true;
    await expect(
      orchestrator.answer(
        { query: "will fail", requestId: "failed-request-1" },
        { userId: "user-1" },
      ),
    ).rejects.toThrow("provider failed");

    provider.fail = false;
    await expect(
      orchestrator.answer(
        { query: "after failure", requestId: "after-failure-1" },
        { userId: "user-1" },
      ),
    ).resolves.toMatchObject({ state: "completed" });
  });

  it("rejects reuse of a request id for another message", async () => {
    const { orchestrator } = createOrchestrator();
    await orchestrator.answer(
      { query: "original", requestId: "reused-request-1" },
      { userId: "user-1" },
    );
    await expect(
      orchestrator.answer(
        { query: "different", requestId: "reused-request-1" },
        { userId: "user-1" },
      ),
    ).rejects.toMatchObject({ code: "AI_REQUEST_ID_REUSED", statusCode: 409 });
  });
});
