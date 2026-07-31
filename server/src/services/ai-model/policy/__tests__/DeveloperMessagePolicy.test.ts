import { describe, expect, it } from "vitest";

import {
  buildDefaultDeveloperMessage,
  resolveDeveloperMessage,
} from "../DeveloperMessagePolicy";

// Real config, no module mock: `optimize_standard` declares
// useDeveloperMessage, `span_labeling` does not.
describe("DeveloperMessagePolicy", () => {
  it("returns explicit developerMessage when provided", () => {
    const result = resolveDeveloperMessage({
      operation: "span_labeling",
      params: {
        systemPrompt: "prompt",
        developerMessage: "explicit-dev-message",
      },
      hasStructuredOutput: true,
      hasStrictSchema: false,
    });

    expect(result).toBe("explicit-dev-message");
  });

  it("builds default developer message when operation requires it", () => {
    const result = resolveDeveloperMessage({
      operation: "optimize_standard",
      params: {
        systemPrompt: "prompt",
      },
      hasStructuredOutput: true,
      hasStrictSchema: false,
    });

    expect(result).toContain("OUTPUT FORMAT:");
    expect(result).toContain("Respond with ONLY valid JSON");
    expect(result).toContain("SECURITY:");
  });

  it("omits output-format section when strict schema is enabled", () => {
    const result = buildDefaultDeveloperMessage(true, true);

    expect(result).not.toContain("OUTPUT FORMAT:");
    expect(result).toContain("DATA HANDLING:");
  });

  it("returns undefined when operation does not require developer message", () => {
    const result = resolveDeveloperMessage({
      operation: "span_labeling",
      params: {
        systemPrompt: "prompt",
      },
      hasStructuredOutput: false,
      hasStrictSchema: false,
    });

    expect(result).toBeUndefined();
  });
});
