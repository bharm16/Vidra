import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectProvider,
  getProviderCapabilities,
  detectAndGetCapabilities,
  shouldUseStrictSchema,
  shouldUseDeveloperMessage,
} from "../ProviderDetector";
import { ModelConfig } from "@config/modelConfig";

describe("detectProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("error handling", () => {
    it("returns unknown for empty options", () => {
      expect(detectProvider({})).toBe("unknown");
    });

    it("returns unknown for undefined options", () => {
      expect(detectProvider({ client: undefined, model: undefined })).toBe(
        "unknown",
      );
    });

    it("returns unknown for unrecognized client", () => {
      expect(detectProvider({ client: "unknownprovider" })).toBe("unknown");
    });

    it("returns unknown for unrecognized model", () => {
      expect(detectProvider({ model: "some-unknown-model-xyz" })).toBe(
        "unknown",
      );
    });
  });

  describe("client detection", () => {
    it("detects openai from client string", () => {
      expect(detectProvider({ client: "openai" })).toBe("openai");
      expect(detectProvider({ client: "OpenAI" })).toBe("openai");
      expect(detectProvider({ client: "openai-client" })).toBe("openai");
    });

    it("detects groq from client string", () => {
      expect(detectProvider({ client: "groq" })).toBe("groq");
      expect(detectProvider({ client: "Groq" })).toBe("groq");
      expect(detectProvider({ client: "groq-llama" })).toBe("groq");
    });

    it("detects qwen from client string", () => {
      expect(detectProvider({ client: "qwen" })).toBe("qwen");
      expect(detectProvider({ client: "Qwen-2.5" })).toBe("qwen");
    });

    it("detects anthropic from client string", () => {
      expect(detectProvider({ client: "anthropic" })).toBe("anthropic");
      expect(detectProvider({ client: "Anthropic" })).toBe("anthropic");
    });

    it("detects gemini from client string", () => {
      expect(detectProvider({ client: "gemini" })).toBe("gemini");
      expect(detectProvider({ client: "Gemini-Pro" })).toBe("gemini");
    });
  });

  describe("model detection", () => {
    it("detects openai from gpt models", () => {
      expect(detectProvider({ model: "gpt-4" })).toBe("openai");
      expect(detectProvider({ model: "gpt-4o" })).toBe("openai");
      expect(detectProvider({ model: "gpt-3.5-turbo" })).toBe("openai");
    });

    it("detects openai from o1/o3 models", () => {
      expect(detectProvider({ model: "o1-preview" })).toBe("openai");
      expect(detectProvider({ model: "o3-mini" })).toBe("openai");
    });

    it("detects qwen from qwen models", () => {
      expect(detectProvider({ model: "qwen-2.5-72b" })).toBe("qwen");
      expect(detectProvider({ model: "Qwen-VL" })).toBe("qwen");
    });

    it("detects groq from llama models", () => {
      expect(detectProvider({ model: "llama-3.1-70b" })).toBe("groq");
      expect(detectProvider({ model: "llama-3.2-11b" })).toBe("groq");
    });

    it("detects groq from mixtral models", () => {
      expect(detectProvider({ model: "mixtral-8x7b" })).toBe("groq");
    });

    it("detects anthropic from claude models", () => {
      expect(detectProvider({ model: "claude-3.5-sonnet" })).toBe("anthropic");
      expect(detectProvider({ model: "claude-3-opus" })).toBe("anthropic");
    });

    it("detects gemini from gemini models", () => {
      expect(detectProvider({ model: "gemini-pro" })).toBe("gemini");
      expect(detectProvider({ model: "gemini-1.5-flash" })).toBe("gemini");
    });
  });

  describe("environment variable detection", () => {
    it("detects from explicit providerEnvVar", () => {
      process.env.CUSTOM_PROVIDER = "openai";
      expect(detectProvider({ providerEnvVar: "CUSTOM_PROVIDER" })).toBe(
        "openai",
      );
    });

    it("handles case-insensitive env var values", () => {
      process.env.CUSTOM_PROVIDER = "GROQ";
      expect(detectProvider({ providerEnvVar: "CUSTOM_PROVIDER" })).toBe(
        "groq",
      );
    });

    it("detects from operation-based env var", () => {
      process.env.SPAN_LABELING_PROVIDER = "groq";
      expect(detectProvider({ operation: "span-labeling" })).toBe("groq");
    });
  });

  // Real config, no module mock: the operation branch is a lookup, so the
  // operations under test are the configured ones.
  describe("operation-based detection", () => {
    it("detects from ModelConfig for known operation", () => {
      expect(ModelConfig.optimize_standard.client).toBe("openai");
      expect(detectProvider({ operation: "optimize_standard" })).toBe("openai");
    });

    it("detects qwen from the enhance_suggestions config", () => {
      expect(ModelConfig.enhance_suggestions.client).toBe("qwen");
      expect(detectProvider({ operation: "enhance_suggestions" })).toBe("qwen");
    });

    it("returns unknown for unknown operation without env var", () => {
      expect(detectProvider({ operation: "unknown-operation" })).toBe(
        "unknown",
      );
    });
  });

  describe("priority order", () => {
    it("prioritizes client over model", () => {
      expect(detectProvider({ client: "groq", model: "gpt-4" })).toBe("groq");
    });

    it("prioritizes client over providerEnvVar", () => {
      process.env.PROVIDER = "openai";
      expect(
        detectProvider({ client: "groq", providerEnvVar: "PROVIDER" }),
      ).toBe("groq");
    });
  });
});

describe("getProviderCapabilities", () => {
  describe("core behavior", () => {
    it("returns openai capabilities", () => {
      const caps = getProviderCapabilities("openai");

      expect(caps.strictJsonSchema).toBe(true);
      expect(caps.developerRole).toBe(true);
      expect(caps.structuredOutputTemperature).toBe(0.0);
      expect(caps.needsPromptFormatInstructions).toBe(false);
    });

    it("returns groq capabilities", () => {
      const caps = getProviderCapabilities("groq");

      expect(caps.strictJsonSchema).toBe(false);
      expect(caps.developerRole).toBe(false);
      expect(caps.sandwichPrompting).toBe(true);
      expect(caps.assistantPrefill).toBe(true);
      expect(caps.structuredOutputTemperature).toBe(0.1);
      expect(caps.needsPromptFormatInstructions).toBe(true);
    });

    it("returns qwen capabilities", () => {
      const caps = getProviderCapabilities("qwen");

      expect(caps.strictJsonSchema).toBe(false);
      expect(caps.sandwichPrompting).toBe(true);
      expect(caps.assistantPrefill).toBe(true);
    });

    it("returns anthropic capabilities", () => {
      const caps = getProviderCapabilities("anthropic");

      expect(caps.strictJsonSchema).toBe(false);
      expect(caps.assistantPrefill).toBe(true);
      expect(caps.seed).toBe(false);
    });

    it("returns gemini capabilities", () => {
      const caps = getProviderCapabilities("gemini");

      expect(caps.strictJsonSchema).toBe(true);
      expect(caps.developerRole).toBe(false);
      expect(caps.seed).toBe(false);
    });

    it("returns unknown capabilities for unknown provider", () => {
      const caps = getProviderCapabilities("unknown");

      expect(caps.strictJsonSchema).toBe(false);
      expect(caps.developerRole).toBe(false);
      expect(caps.needsPromptFormatInstructions).toBe(true);
    });
  });
});

describe("detectAndGetCapabilities", () => {
  describe("core behavior", () => {
    it("returns both provider and capabilities", () => {
      const result = detectAndGetCapabilities({ client: "openai" });

      expect(result.provider).toBe("openai");
      expect(result.capabilities.strictJsonSchema).toBe(true);
    });

    it("returns unknown provider with fallback capabilities", () => {
      const result = detectAndGetCapabilities({});

      expect(result.provider).toBe("unknown");
      expect(result.capabilities).toBeDefined();
    });
  });
});

describe("shouldUseStrictSchema", () => {
  describe("error handling", () => {
    it("returns false when hasSchema is false", () => {
      expect(
        shouldUseStrictSchema({ client: "openai", hasSchema: false }),
      ).toBe(false);
    });

    it("returns false when hasSchema is undefined", () => {
      expect(shouldUseStrictSchema({ client: "openai" })).toBe(false);
    });
  });

  describe("core behavior", () => {
    it("returns true for openai with schema", () => {
      expect(shouldUseStrictSchema({ client: "openai", hasSchema: true })).toBe(
        true,
      );
    });

    it("returns true for gemini with schema", () => {
      expect(shouldUseStrictSchema({ client: "gemini", hasSchema: true })).toBe(
        true,
      );
    });

    it("returns false for groq even with schema", () => {
      expect(shouldUseStrictSchema({ client: "groq", hasSchema: true })).toBe(
        false,
      );
    });

    it("returns false for anthropic even with schema", () => {
      expect(
        shouldUseStrictSchema({ client: "anthropic", hasSchema: true }),
      ).toBe(false);
    });
  });
});

describe("shouldUseDeveloperMessage", () => {
  describe("core behavior", () => {
    it("returns true for openai", () => {
      expect(shouldUseDeveloperMessage({ client: "openai" })).toBe(true);
    });

    it("returns false for groq", () => {
      expect(shouldUseDeveloperMessage({ client: "groq" })).toBe(false);
    });

    it("returns false for anthropic", () => {
      expect(shouldUseDeveloperMessage({ client: "anthropic" })).toBe(false);
    });

    it("returns false for gemini", () => {
      expect(shouldUseDeveloperMessage({ client: "gemini" })).toBe(false);
    });

    it("returns false for unknown provider", () => {
      expect(shouldUseDeveloperMessage({})).toBe(false);
    });
  });
});
