import { describe, it, expect, vi } from "vitest";
import { groqSpanProfile } from "../groq.profile";
import { openAiSpanProfile } from "../openai.profile";
import { geminiSpanProfile } from "../gemini.profile";
import { genericSpanProfile } from "../generic.profile";
import { SPAN_PROVIDER_PROFILES } from "../registry";
import type { LabelSpansResult } from "@llm/span-labeling/types";

/**
 * Provider behavior is profile functions now, not protected methods reached
 * through `class Test extends GroqLlmClient` — so these call them directly.
 * This file replaces four overlapping suites that each tested the same
 * behavior at a different depth (LlmClients, span-labeling-llm-clients,
 * span-labeling-llm-clients-additional, span-labeling-gemini-client).
 */

const result = (
  spans: LabelSpansResult["spans"],
  notes = "",
): LabelSpansResult => ({ spans, meta: { version: "v1", notes } });

const streamOf = (chunks: string[]) =>
  ({
    stream: vi.fn(
      async (
        _operation: string,
        { onChunk }: { onChunk: (chunk: string) => void },
      ) => {
        chunks.forEach(onChunk);
      },
    ),
  }) as never;

const streamParams = (text: string, aiService: never) => ({
  text,
  policy: {},
  options: {},
  enableRepair: false,
  aiService,
  cache: {} as never,
});

describe("groq profile", () => {
  it("caps confidence at the logprobs average", () => {
    const out = groqSpanProfile.postProcess!(
      result([
        { text: "cat", role: "subject", confidence: 0.9 },
        { text: "runs", role: "action", confidence: 0.2 },
      ]),
      { averageConfidence: 0.4, optimizations: ["logprobs"] },
    );

    expect(out.spans[0]?.confidence).toBe(0.4);
    expect(
      (out.spans[0] as unknown as Record<string, unknown>)._originalConfidence,
    ).toBe(0.9);
    const opts = (out.meta._providerOptimizations ?? {}) as Record<
      string,
      unknown
    >;
    expect(opts.averageLogprobsConfidence).toBe(0.4);
    expect(out.meta._clientType).toBe("groq");
  });

  it("never raises confidence above the self-reported value", () => {
    const out = groqSpanProfile.postProcess!(
      result([{ text: "sky", role: "style", confidence: 0.3 }]),
      { averageConfidence: 0.9 },
    );

    expect(out.spans[0]?.confidence).toBe(0.3);
  });

  it("skips adjustment when logprobs metadata is missing", () => {
    const out = groqSpanProfile.postProcess!(
      result([{ text: "sky", role: "style", confidence: 0.9 }]),
      {},
    );

    expect(out.spans[0]?.confidence).toBe(0.9);
    const opts = (out.meta._providerOptimizations ?? {}) as Record<
      string,
      unknown
    >;
    expect(opts.logprobsAdjustment).toBe(false);
  });

  it("keeps the result unchanged when there are no spans", () => {
    const out = groqSpanProfile.postProcess!(result([]), {
      averageConfidence: 0.2,
    });

    expect(out.spans).toEqual([]);
    const opts = (out.meta._providerOptimizations ?? {}) as Record<
      string,
      unknown
    >;
    expect(opts.logprobsAdjustment).toBe(false);
  });

  it("requests logprobs, which the capping depends on", () => {
    expect(groqSpanProfile.requestOptions.enableLogprobs).toBe(true);
  });
});

describe("openai profile", () => {
  it("tags provider metadata without touching spans", () => {
    const out = openAiSpanProfile.postProcess!(
      result([{ text: "sky", role: "style", confidence: 0.8 }]),
      {},
    );

    const opts = (out.meta._providerOptimizations ?? {}) as Record<
      string,
      unknown
    >;
    expect(opts.provider).toBe("openai");
    expect(opts.strictSchema).toBe(true);
    expect(opts.logprobsAdjustment).toBe(false);
    expect(out.meta._clientType).toBe("openai");
    expect(out.spans[0]?.text).toBe("sky");
    expect(out.spans[0]?.confidence).toBe(0.8);
  });

  it("returns meta even when spans are empty", () => {
    expect(
      openAiSpanProfile.postProcess!(result([]), {}).meta._clientType,
    ).toBe("openai");
  });

  it("preserves existing meta fields while appending provider info", () => {
    const out = openAiSpanProfile.postProcess!(
      result([{ text: "sky", role: "style", confidence: 0.8 }], "keep"),
      {},
    );

    expect(out.meta.notes).toBe("keep");
  });

  it("does NOT request logprobs, despite OpenAI being capable of them", () => {
    // ADR-0001 warned that dropping this override would silently start
    // requesting logprobs and exercise the adapter's rejection retry.
    // ADR-0020 preserves it as data; this pins it.
    expect(openAiSpanProfile.requestOptions.enableLogprobs).toBe(false);
  });
});

describe("gemini profile", () => {
  it("normalizes category to role and strips category", () => {
    const normalized = geminiSpanProfile.normalizeParsedResponse!({
      spans: [{ text: "cat", category: "subject" }],
    });

    const span = (normalized.spans as Array<Record<string, unknown>>)[0];
    expect(span?.role).toBe("subject");
    expect(span ? "category" in span : false).toBe(false);
  });

  it("recovers spans from non-JSON text", () => {
    const parsed = geminiSpanProfile.parseResponseText!(
      'Here are spans:\n{"text":"cat","role":"subject"}\n{"text":"runs","role":"action"}',
    );

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const value = parsed.value as { spans?: Array<Record<string, unknown>> };
      expect(value.spans).toHaveLength(2);
      expect(value.spans?.[0]?.text).toBe("cat");
    }
  });

  it("parses valid JSON without invoking recovery", () => {
    const parsed = geminiSpanProfile.parseResponseText!(
      JSON.stringify({ spans: [{ text: "Hero", role: "subject" }] }),
    );

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const value = parsed.value as { spans?: Array<{ role?: string }> };
      expect(value.spans?.[0]?.role).toBe("subject");
    }
  });

  it("reports a parse error when recovery finds nothing", () => {
    expect(
      geminiSpanProfile.parseResponseText!("no spans here at all").ok,
    ).toBe(false);
  });

  it("streams NDJSON spans, stripping array wrappers", async () => {
    const spans: Array<Record<string, unknown>> = [];
    for await (const span of geminiSpanProfile.streamSpans!(
      streamParams(
        "Hero Sky",
        streamOf([
          "[\n",
          '{"text":"Hero","role":"subject"},\n',
          '{"text":"Sky","category":"style"}\n',
          "]\n",
        ]),
      ),
    )) {
      spans.push(span);
    }

    expect(spans).toHaveLength(2);
    expect(spans[0]?.role).toBe("subject");
    expect(spans[1]?.category).toBe("style");
  });

  it("adds category from role while streaming", async () => {
    const spans: Array<Record<string, unknown>> = [];
    for await (const span of geminiSpanProfile.streamSpans!(
      streamParams("Hero", streamOf(['{"text":"Hero","role":"subject"}\n'])),
    )) {
      spans.push(span);
    }

    expect(spans[0]?.category).toBe("subject");
  });
});

describe("generic profile — ADR-0020 preserved accident", () => {
  it("pairs the Gemini schema with the Groq prompt arm", () => {
    // Reproduces exactly what the old generic client did: `"unknown"` matched
    // no client substring so detection fell through to ModelConfig's default
    // (gemini) for the schema, while buildSystemPrompt took its else arm.
    // Preserved deliberately — changing it is a separately-measured decision.
    expect(genericSpanProfile.promptProviderName).toBe("unknown");
    expect(genericSpanProfile.jsonSchema).toBe(geminiSpanProfile.jsonSchema);
  });
});

describe("registry invariants", () => {
  it("gives each provider a distinct profile with its own id", () => {
    for (const [id, profile] of Object.entries(SPAN_PROVIDER_PROFILES)) {
      expect(profile.id).toBe(id);
    }
  });

  it("declares a schema for every provider", () => {
    // Today every profile sends one; a future profile that doesn't should be
    // a deliberate edit here, not a silent undefined.
    for (const profile of Object.values(SPAN_PROVIDER_PROFILES)) {
      expect(profile.jsonSchema).toBeDefined();
    }
  });

  it("offers streaming only where the provider supports it", () => {
    expect(SPAN_PROVIDER_PROFILES.gemini.streamSpans).toBeTypeOf("function");
    expect(SPAN_PROVIDER_PROFILES.groq.streamSpans).toBeUndefined();
    expect(SPAN_PROVIDER_PROFILES.openai.streamSpans).toBeUndefined();
    expect(SPAN_PROVIDER_PROFILES.generic.streamSpans).toBeUndefined();
  });
});
