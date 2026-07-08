import { describe, expect, it, vi, type Mock } from "vitest";
import { ModelConfig } from "@config/modelConfig";
import { LlmProviderCircuitManager } from "@llm/failover/LlmProviderCircuitManager";
import {
  AIClientError,
  type AIResponse,
  type IAIClient,
} from "@interfaces/IAIClient";
import type { LlmCallTelemetryService } from "@services/observability/LlmCallTelemetryService";
import { AIModelService } from "../AIModelService";

/**
 * Fault-injection coverage for health-based LLM provider failover.
 *
 * Uses the REAL routing stack (ExecutionPlanResolver, ClientResolver, request
 * builders, ModelConfig) with fake provider clients at the edge. The viable
 * fallback matrix is derived from ModelConfig itself: an executionType is
 * viable when its fallbackTo names a different provider that the DI layer
 * actually registers (openai / groq / qwen / gemini — "anthropic" is not a
 * registered client, so operations falling back to it are excluded).
 */

const REGISTERED_PROVIDERS = ["openai", "groq", "qwen", "gemini"] as const;

function isRegistered(provider: string | undefined): provider is string {
  return (
    provider !== undefined &&
    (REGISTERED_PROVIDERS as readonly string[]).includes(provider)
  );
}

const VIABLE_FALLBACK_OPERATIONS = Object.entries(ModelConfig)
  .filter(
    ([, cfg]) =>
      isRegistered(cfg.client) &&
      isRegistered(cfg.fallbackTo) &&
      cfg.fallbackTo !== cfg.client,
  )
  .map(([operation, cfg]) => ({
    operation,
    primary: cfg.client,
    fallback: cfg.fallbackTo as string,
  }));

interface FakeProvider {
  client: IAIClient;
  complete: Mock;
  setHealthy: (healthy: boolean) => void;
}

function fakeProvider(provider: string, healthy = true): FakeProvider {
  let isHealthy = healthy;
  const complete = vi.fn(async (): Promise<AIResponse> => {
    if (!isHealthy) {
      throw new AIClientError(`${provider} injected fault`, 503);
    }
    return {
      text: '{"ok":true}',
      metadata: {
        provider,
        model: `${provider}-fake-model`,
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
    };
  });
  return {
    client: { complete } as IAIClient,
    complete,
    setHealthy: (h: boolean) => {
      isHealthy = h;
    },
  };
}

function buildHarness({
  threshold = 3,
  cooldownMs = 30_000,
}: { threshold?: number; cooldownMs?: number } = {}) {
  const providers = {
    openai: fakeProvider("openai"),
    groq: fakeProvider("groq"),
    qwen: fakeProvider("qwen"),
    gemini: fakeProvider("gemini"),
  };
  const providersByName: Record<string, FakeProvider> = providers;
  const provider = (name: string): FakeProvider => {
    const found = providersByName[name];
    if (!found) {
      throw new Error(`no fake provider registered for '${name}'`);
    }
    return found;
  };

  let nowMs = 1_000_000;
  const circuit = new LlmProviderCircuitManager({
    consecutiveFailureThreshold: threshold,
    cooldownMs,
    now: () => nowMs,
  });

  const record = vi.fn();
  const telemetry = { record } as unknown as LlmCallTelemetryService;

  const service = new AIModelService({
    clients: {
      openai: providers.openai.client,
      groq: providers.groq.client,
      qwen: providers.qwen.client,
      gemini: providers.gemini.client,
    },
    llmCallTelemetry: telemetry,
    providerCircuit: circuit,
  });

  return {
    service,
    provider,
    circuit,
    record,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

const PARAMS = { systemPrompt: "system", userMessage: "user" };

describe("viable fallback matrix derived from ModelConfig", () => {
  it("covers the three active authoring surfaces", () => {
    const operations = VIABLE_FALLBACK_OPERATIONS.map((v) => v.operation);
    // span labeling / enhancement / optimization respectively
    expect(operations).toContain("span_labeling");
    expect(operations).toContain("enhance_suggestions");
    expect(operations).toContain("optimize_standard");
  });

  it("excludes operations whose fallback provider is not registered", () => {
    const operations = VIABLE_FALLBACK_OPERATIONS.map((v) => v.operation);
    // llm_judge_video falls back to "anthropic", which the DI layer never
    // registers — there is no viable second provider for it.
    expect(operations).not.toContain("llm_judge_video");
  });
});

describe.each(VIABLE_FALLBACK_OPERATIONS)(
  "fault injection: $operation ($primary → $fallback)",
  ({ operation, primary, fallback }) => {
    it("completes on the fallback provider with correct telemetry attribution", async () => {
      const { service, provider, record } = buildHarness();
      provider(primary).setHealthy(false);

      const response = await service.execute(operation, PARAMS);

      expect(provider(primary).complete).toHaveBeenCalledTimes(1);
      expect(provider(fallback).complete).toHaveBeenCalledTimes(1);
      expect(response.metadata.provider).toBe(fallback);
      expect(record).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          executionType: operation,
          provider: fallback,
          model: `${fallback}-fake-model`,
          outcome: "success",
        }),
      );
    });
  },
);

describe("circuit lifecycle through the routing layer", () => {
  const spanLabeling = VIABLE_FALLBACK_OPERATIONS.find(
    (v) => v.operation === "span_labeling",
  );
  if (!spanLabeling) {
    throw new Error("span_labeling lost its viable fallback in ModelConfig");
  }
  const { operation, primary, fallback } = spanLabeling;

  it("opens after N consecutive failures and stops dialing the primary", async () => {
    const { service, provider, circuit, record } = buildHarness({
      threshold: 3,
    });
    provider(primary).setHealthy(false);

    for (let i = 0; i < 3; i += 1) {
      await service.execute(operation, PARAMS);
    }
    expect(circuit.isOpen(primary)).toBe(true);
    expect(provider(primary).complete).toHaveBeenCalledTimes(3);

    provider(primary).complete.mockClear();
    provider(fallback).complete.mockClear();
    record.mockClear();

    const response = await service.execute(operation, PARAMS);

    expect(provider(primary).complete).not.toHaveBeenCalled();
    expect(provider(fallback).complete).toHaveBeenCalledTimes(1);
    expect(response.metadata.provider).toBe(fallback);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        executionType: operation,
        provider: fallback,
        outcome: "success",
      }),
    );
  });

  it("half-opens after cooldown; a successful probe closes the circuit", async () => {
    const { service, provider, circuit, advance } = buildHarness({
      threshold: 3,
      cooldownMs: 30_000,
    });
    provider(primary).setHealthy(false);

    for (let i = 0; i < 3; i += 1) {
      await service.execute(operation, PARAMS);
    }
    expect(circuit.isOpen(primary)).toBe(true);

    advance(30_001);
    provider(primary).setHealthy(true);
    provider(primary).complete.mockClear();
    provider(fallback).complete.mockClear();

    const probeResponse = await service.execute(operation, PARAMS);

    expect(provider(primary).complete).toHaveBeenCalledTimes(1);
    expect(provider(fallback).complete).not.toHaveBeenCalled();
    expect(probeResponse.metadata.provider).toBe(primary);
    expect(circuit.getSnapshot(primary).state).toBe("closed");

    const followUp = await service.execute(operation, PARAMS);
    expect(followUp.metadata.provider).toBe(primary);
  });

  it("half-opens after cooldown; a failed probe reopens the circuit", async () => {
    const { service, provider, circuit, advance } = buildHarness({
      threshold: 3,
      cooldownMs: 30_000,
    });
    provider(primary).setHealthy(false);

    for (let i = 0; i < 3; i += 1) {
      await service.execute(operation, PARAMS);
    }
    expect(circuit.isOpen(primary)).toBe(true);

    advance(30_001);
    provider(primary).complete.mockClear();
    provider(fallback).complete.mockClear();

    // Probe attempt: primary is dialed once, fails, request completes on
    // the fallback, and the circuit reopens.
    const probeResponse = await service.execute(operation, PARAMS);
    expect(provider(primary).complete).toHaveBeenCalledTimes(1);
    expect(probeResponse.metadata.provider).toBe(fallback);
    expect(circuit.isOpen(primary)).toBe(true);

    provider(primary).complete.mockClear();
    const nextResponse = await service.execute(operation, PARAMS);
    expect(provider(primary).complete).not.toHaveBeenCalled();
    expect(nextResponse.metadata.provider).toBe(fallback);
  });

  it("fails open: when primary and fallback circuits are both open, the primary is still attempted", async () => {
    const { service, provider, circuit } = buildHarness({ threshold: 2 });
    provider(primary).setHealthy(false);
    provider(fallback).setHealthy(false);

    for (let i = 0; i < 2; i += 1) {
      await service.execute(operation, PARAMS).catch(() => undefined);
    }
    expect(circuit.isOpen(primary)).toBe(true);
    expect(circuit.isOpen(fallback)).toBe(true);

    provider(primary).complete.mockClear();
    await service.execute(operation, PARAMS).catch(() => undefined);
    expect(provider(primary).complete).toHaveBeenCalledTimes(1);
  });

  it("does not count client aborts or 4xx input errors toward circuit health", async () => {
    const { service, provider, circuit } = buildHarness({ threshold: 2 });
    provider(primary).complete.mockImplementation(async () => {
      throw new AIClientError(`${primary} rejected the request`, 400);
    });

    for (let i = 0; i < 4; i += 1) {
      await service.execute(operation, PARAMS);
    }

    expect(circuit.isOpen(primary)).toBe(false);
    expect(circuit.getSnapshot(primary).consecutiveFailures).toBe(0);
  });
});
