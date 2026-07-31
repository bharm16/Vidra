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

  it("adds developerMessage when provider supports developer role", () => {
    resolveDeveloperMessageMock.mockReturnValue("dev-rules");

    const options = buildRequestOptions({
      operation: "enhance_suggestions",
      params: { systemPrompt: "prompt" },
      config: baseConfig,
      capabilities: {
        bookending: true,
        developerRole: true,
        strictJsonSchema: true,
      } as never,
      jsonMode: false,
    });

    expect(resolveDeveloperMessageMock).toHaveBeenCalledTimes(1);
    expect(options.developerMessage).toBe("dev-rules");
  });

  it("prefers explicit seed and falls back to hash seed when configured", () => {
    resolveDeveloperMessageMock.mockReturnValue(undefined);
    hashStringMock.mockReturnValue(42);

    const hashed = buildRequestOptions({
      operation: "span_labeling",
      params: { systemPrompt: "prompt" },
      config: baseConfig,
      capabilities: { bookending: true, developerRole: false } as never,
      jsonMode: false,
    });
    expect(hashed.seed).toBe(42);

    const explicit = buildRequestOptions({
      operation: "span_labeling",
      params: { systemPrompt: "prompt", seed: 999 },
      config: baseConfig,
      capabilities: { bookending: true, developerRole: false } as never,
      jsonMode: false,
    });
    expect(explicit.seed).toBe(999);
  });

  it("passes through logprobs and topLogprobs options", () => {
    resolveDeveloperMessageMock.mockReturnValue(undefined);

    const options = buildRequestOptions({
      operation: "enhance_suggestions",
      params: {
        systemPrompt: "prompt",
        logprobs: true,
        topLogprobs: 3,
      },
      config: baseConfig,
      capabilities: { bookending: false, developerRole: false } as never,
      jsonMode: false,
    });

    expect(options.logprobs).toBe(true);
    expect(options.topLogprobs).toBe(3);
  });
});
