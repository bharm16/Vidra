import { ModelConfig } from "@config/modelConfig";
import { describe, expect, it } from "vitest";
import {
  capabilitiesFor,
  getProviderCapabilities,
  resolveProvider,
  type ProviderType,
} from "../ProviderDetector";

/**
 * Provider resolution is an exact lookup now (ADR-0020). The tests that
 * covered the old five-tier cascade — model-name substring matching, the
 * `${OPERATION}_PROVIDER` env read, the `providerEnvVar` parameter — died
 * with it. What replaces them is the equivalence claim: for every client name
 * the router can actually produce, the answer is the same as before.
 */

const REGISTERED_CLIENTS: Array<[string, ProviderType]> = [
  ["openai", "openai"],
  ["groq", "groq"],
  ["qwen", "qwen"],
  ["anthropic", "anthropic"],
  ["gemini", "gemini"],
];

describe("resolveProvider", () => {
  it("maps every registered client name to its provider", () => {
    for (const [client, expected] of REGISTERED_CLIENTS) {
      expect(resolveProvider({ client })).toBe(expected);
    }
  });

  it("falls back to the operation's configured client", () => {
    // The same configuration the router starts from, so the two agree except
    // during an active failover — where the caller should pass the routed
    // client explicitly.
    const configured = ModelConfig.span_labeling.client;
    expect(resolveProvider({ operation: "span_labeling" })).toBe(
      resolveProvider({ client: configured }),
    );
  });

  it("prefers an explicit client over the operation default", () => {
    expect(
      resolveProvider({ operation: "span_labeling", client: "openai" }),
    ).toBe("openai");
  });

  it("answers 'unknown' rather than guessing", () => {
    expect(resolveProvider({})).toBe("unknown");
    expect(resolveProvider({ client: "some-new-vendor" })).toBe("unknown");
    expect(resolveProvider({ operation: "not-an-operation" })).toBe("unknown");
  });

  it("never infers a provider from the model name", () => {
    // The banned pattern: `model.includes("gpt")` and friends. A model id
    // alone is not evidence of which client is running it — after a failover
    // reroute it is actively misleading.
    expect(capabilitiesFor({ model: "gpt-4o-2024-08-06" }).provider).toBe(
      "unknown",
    );
    expect(capabilitiesFor({ model: "llama-3.3-70b" }).provider).toBe(
      "unknown",
    );
    expect(capabilitiesFor({ model: "claude-opus-4" }).provider).toBe(
      "unknown",
    );
    expect(capabilitiesFor({ model: "gemini-2.5-flash" }).provider).toBe(
      "unknown",
    );
  });
});

describe("getProviderCapabilities", () => {
  it("falls back to the conservative row for an unknown provider", () => {
    const caps = getProviderCapabilities("unknown");
    expect(caps.strictJsonSchema).toBe(false);
    expect(caps.developerRole).toBe(false);
    expect(caps.bookending).toBe(false);
    expect(caps.needsPromptFormatInstructions).toBe(true);
  });
});
