import { describe, expect, it, vi } from "vitest";

const { hashStringMock, resolveDeveloperMessageMock } = vi.hoisted(() => ({
  hashStringMock: vi.fn(),
  resolveDeveloperMessageMock: vi.fn(),
}));

vi.mock("@utils/hash", () => ({
  hashString: hashStringMock,
}));

vi.mock("../../policy/DeveloperMessagePolicy", () => ({
  resolveDeveloperMessage: resolveDeveloperMessageMock,
}));

import { buildRequestOptions } from "../RequestOptionsBuilder";

// Real config, no module mock: `enhance_suggestions` does not declare useSeed,
// `span_labeling` does.

const baseConfig = {
  client: "openai",
  model: "gpt-4o",
  temperature: 0.2,
  maxTokens: 1000,
  timeout: 30000,
};

describe("buildRequestOptions", () => {
  it("builds request options from config defaults and param overrides", () => {
    resolveDeveloperMessageMock.mockReturnValue(undefined);

    const options = buildRequestOptions({
      operation: "enhance_suggestions",
      params: {
        systemPrompt: "prompt",
        temperature: 0.7,
      },
      config: baseConfig,
      capabilities: { bookending: true, developerRole: false } as never,
      jsonMode: true,
    });

    expect(options.model).toBe("gpt-4o");
    expect(options.temperature).toBe(0.7);
    expect(options.maxTokens).toBe(1000);
    expect(options.timeout).toBe(30000);
    expect(options.jsonMode).toBe(true);
    expect(options.enableBookending).toBe(true);
  });
});
