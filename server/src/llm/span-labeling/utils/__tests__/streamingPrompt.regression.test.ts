/**
 * Regression: the streaming span-labeling prompt must come from the prompt builder.
 *
 * Bug: `GeminiLlmClient.streamSpans` used `GEMINI_STREAMING_SYSTEM_PROMPT`
 * directly, bypassing `buildSystemPrompt`. The live streaming path therefore
 * carried no `IMMUTABLE_SOVEREIGN_PREAMBLE`, ignored `templateVersion` entirely
 * (so an I2V request got the full standard taxonomy instead of motion-only
 * categories), and `PROMPT_VERSIONS` logged a version that never ran.
 *
 * Invariant: one module decides the security preamble, the I2V-vs-standard
 * template, and the output format — for streaming and buffered requests alike.
 */

import { describe, it, expect } from "vitest";
import { IMMUTABLE_SOVEREIGN_PREAMBLE } from "@utils/SecurityPrompts";
import { buildSystemPrompt } from "../promptBuilder";
import { GEMINI_NDJSON_OUTPUT_FORMAT } from "../../schemas/GeminiSchema";

const buildStreamingPrompt = (templateVersion?: string): string =>
  buildSystemPrompt(
    "a woman walks",
    true,
    "gemini",
    false,
    templateVersion,
    true,
  );

describe("streaming span labeling prompt", () => {
  it("carries the security preamble", () => {
    expect(buildStreamingPrompt("v2.3")).toContain(
      IMMUTABLE_SOVEREIGN_PREAMBLE,
    );
  });

  it("carries the security preamble for the buffered gemini variant too", () => {
    const buffered = buildSystemPrompt("a woman walks", true, "gemini", false);
    expect(buffered).toContain(IMMUTABLE_SOVEREIGN_PREAMBLE);
  });

  it("asks for NDJSON output", () => {
    expect(buildStreamingPrompt("v2.3")).toContain(GEMINI_NDJSON_OUTPUT_FORMAT);
  });

  it("an I2V request produces the motion-only I2V template", () => {
    const i2v = buildStreamingPrompt("i2v-v2");
    const standard = buildStreamingPrompt("v2.3");

    expect(i2v).not.toBe(standard);
    // The I2V template's defining constraint: static visual attributes are
    // excluded because the reference image already fixes them.
    expect(i2v.toLowerCase()).toContain("motion");
    expect(i2v).toContain(IMMUTABLE_SOVEREIGN_PREAMBLE);
  });

  it("an I2V streaming request still asks for NDJSON", () => {
    // The I2V template alone asks for a single JSON body, which the NDJSON
    // line parser cannot consume.
    expect(buildStreamingPrompt("i2v-v2")).toContain(
      GEMINI_NDJSON_OUTPUT_FORMAT,
    );
  });

  it("the NDJSON instruction is not duplicated when the template already has it", () => {
    const prompt = buildStreamingPrompt("v2.3");
    const occurrences = prompt.split(GEMINI_NDJSON_OUTPUT_FORMAT).length - 1;
    expect(occurrences).toBe(1);
  });

  it("a buffered request does not ask for NDJSON", () => {
    const buffered = buildSystemPrompt("a woman walks", true, "gemini", false);
    expect(buffered).not.toContain(GEMINI_NDJSON_OUTPUT_FORMAT);
  });
});
