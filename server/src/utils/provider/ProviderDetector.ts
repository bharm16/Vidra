/**
 * Provider Detection Utility
 *
 * Centralizes logic for determining which LLM provider is being used
 * and what capabilities it supports.
 *
 * This enables provider-specific optimizations without polluting
 * business logic with provider detection code.
 */

import { ModelConfig, isOperationName } from "@config/modelConfig";

export type ProviderType =
  | "openai"
  | "groq"
  | "qwen"
  | "anthropic"
  | "gemini"
  | "unknown";

export interface ProviderCapabilities {
  /** Supports strict JSON schema mode (grammar-constrained decoding) */
  strictJsonSchema: boolean;
  /** Supports developer role message (highest priority instructions) */
  developerRole: boolean;
  /** Supports seed parameter for reproducibility */
  seed: boolean;
  /** Supports logprobs for token-level confidence */
  logprobs: boolean;
  /** Supports predicted outputs for faster structured responses */
  predictedOutputs: boolean;
  /** Supports bookending strategy for long prompts */
  bookending: boolean;
  /** Supports sandwich prompting (format reminder at end) */
  sandwichPrompting: boolean;
  /** Supports assistant prefill for JSON start */
  assistantPrefill: boolean;
  /** Optimal temperature for structured output (0.0 for OpenAI, 0.1 for Llama) */
  structuredOutputTemperature: number;
  /** Whether to add format instructions to prompts (not needed with strict schema) */
  needsPromptFormatInstructions: boolean;
}

/**
 * Provider capability definitions
 *
 * OpenAI GPT-4o:
 * - Strict JSON schema with grammar-constrained decoding
 * - Developer role for hard constraints
 * - Temperature 0.0 for deterministic structured output
 * - No need for prompt format instructions when using strict schema
 *
 * Groq/Llama 3:
 * - Validation-based JSON schema (not grammar-constrained)
 * - No developer role
 * - Temperature 0.1 (0.0 causes repetition loops)
 * - Sandwich prompting and prefill for format adherence
 * - Still needs prompt format instructions
 *
 * Qwen (Groq-hosted):
 * - Similar capabilities to Groq for JSON mode
 * - No developer role
 * - Benefits from sandwich prompting + format reminders
 */
const PROVIDER_CAPABILITIES: Record<ProviderType, ProviderCapabilities> = {
  openai: {
    strictJsonSchema: true,
    developerRole: true,
    seed: true,
    logprobs: true,
    predictedOutputs: true,
    bookending: true,
    sandwichPrompting: false, // Not needed with strict schema
    assistantPrefill: false, // Not needed with strict schema
    structuredOutputTemperature: 0.0,
    needsPromptFormatInstructions: false, // Strict schema handles it
  },
  groq: {
    strictJsonSchema: false, // Validation-based, not grammar-constrained
    developerRole: false,
    seed: true,
    logprobs: true,
    predictedOutputs: false,
    bookending: false,
    sandwichPrompting: true,
    assistantPrefill: true,
    structuredOutputTemperature: 0.1,
    needsPromptFormatInstructions: true, // Still needed
  },
  qwen: {
    strictJsonSchema: false,
    developerRole: false,
    seed: true,
    logprobs: true,
    predictedOutputs: false,
    bookending: false,
    sandwichPrompting: true,
    assistantPrefill: true,
    structuredOutputTemperature: 0.1,
    needsPromptFormatInstructions: true,
  },
  anthropic: {
    strictJsonSchema: false,
    developerRole: false,
    seed: false,
    logprobs: false,
    predictedOutputs: false,
    bookending: false,
    sandwichPrompting: false,
    assistantPrefill: true,
    structuredOutputTemperature: 0.0,
    needsPromptFormatInstructions: true,
  },
  gemini: {
    strictJsonSchema: true, // Supports responseSchema
    developerRole: false,
    seed: false,
    logprobs: false,
    predictedOutputs: false,
    bookending: false,
    sandwichPrompting: false,
    assistantPrefill: false,
    structuredOutputTemperature: 0.0,
    needsPromptFormatInstructions: true,
  },
  unknown: {
    strictJsonSchema: false,
    developerRole: false,
    seed: false,
    logprobs: false,
    predictedOutputs: false,
    bookending: false,
    sandwichPrompting: false,
    assistantPrefill: false,
    structuredOutputTemperature: 0.0,
    needsPromptFormatInstructions: true,
  },
};

/**
 * Detect provider from operation name, model name, or environment
 */
export function detectProvider(options: {
  operation?: string | undefined;
  model?: string | undefined;
  client?: string | undefined;
  providerEnvVar?: string | undefined;
}): ProviderType {
  const { operation, model, client, providerEnvVar } = options;

  // Check explicit client specification
  if (client) {
    if (client.toLowerCase().includes("openai")) return "openai";
    if (client.toLowerCase().includes("groq")) return "groq";
    if (client.toLowerCase().includes("qwen")) return "qwen";
    if (client.toLowerCase().includes("anthropic")) return "anthropic";
    if (client.toLowerCase().includes("gemini")) return "gemini";
  }

  // Check environment variable override
  if (providerEnvVar) {
    const envValue = process.env[providerEnvVar]?.toLowerCase();
    if (envValue === "openai") return "openai";
    if (envValue === "groq") return "groq";
    if (envValue === "qwen") return "qwen";
    if (envValue === "anthropic") return "anthropic";
    if (envValue === "gemini") return "gemini";
  }

  // Detect from model name
  if (model) {
    const modelLower = model.toLowerCase();
    if (
      modelLower.includes("gpt") ||
      modelLower.includes("o1") ||
      modelLower.includes("o3")
    ) {
      return "openai";
    }
    if (modelLower.includes("qwen")) {
      return "qwen";
    }
    if (modelLower.includes("llama") || modelLower.includes("mixtral")) {
      return "groq";
    }
    if (modelLower.includes("claude")) {
      return "anthropic";
    }
    if (modelLower.includes("gemini")) {
      return "gemini";
    }
  }

  // Detect from operation-specific environment variables
  if (operation) {
    const operationUpper = operation.toUpperCase().replace(/-/g, "_");
    const providerEnv = process.env[`${operationUpper}_PROVIDER`];
    if (providerEnv) {
      return detectProvider({ client: providerEnv });
    }

    // Deliberately still a runtime string: detectProvider is a best-effort
    // detector for callers that may not hold a configured operation, and
    // "unknown" is its documented answer for one it cannot place.
    if (isOperationName(operation)) {
      const config = ModelConfig[operation];
      return detectProvider({ client: config.client, model: config.model });
    }
  }

  return "unknown";
}

/**
 * Get capabilities for a provider
 */
export function getProviderCapabilities(
  provider: ProviderType,
): ProviderCapabilities {
  return PROVIDER_CAPABILITIES[provider] || PROVIDER_CAPABILITIES.unknown;
}

/**
 * Get capabilities based on detection options
 */
export function detectAndGetCapabilities(options: {
  operation?: string | undefined;
  model?: string | undefined;
  client?: string | undefined;
  providerEnvVar?: string | undefined;
}): { provider: ProviderType; capabilities: ProviderCapabilities } {
  const provider = detectProvider(options);
  return {
    provider,
    capabilities: getProviderCapabilities(provider),
  };
}

/**
 * Check if current operation should use strict JSON schema
 */
export function shouldUseStrictSchema(options: {
  operation?: string | undefined;
  model?: string | undefined;
  client?: string | undefined;
  hasSchema?: boolean | undefined;
}): boolean {
  if (!options.hasSchema) return false;

  const { capabilities } = detectAndGetCapabilities(options);
  return capabilities.strictJsonSchema;
}

/**
 * Check if developer message should be used
 */
export function shouldUseDeveloperMessage(options: {
  operation?: string | undefined;
  model?: string | undefined;
  client?: string | undefined;
}): boolean {
  const { capabilities } = detectAndGetCapabilities(options);
  return capabilities.developerRole;
}

export default {
  detectProvider,
  getProviderCapabilities,
  detectAndGetCapabilities,
  shouldUseStrictSchema,
  shouldUseDeveloperMessage,
};
