/**
 * Provider capabilities, keyed by the client the router actually chose.
 *
 * This file used to *detect* the provider through a five-tier cascade whose
 * third tier classified by substring on the model name — `includes("gpt")`,
 * `includes("llama")`, `includes("claude")`. Two problems (ADR-0020):
 *
 *   - It could disagree with the router. The cascade cannot see client
 *     availability or circuit-breaker state, so after a failover reroute it
 *     kept reporting the primary provider and requests were shaped for a
 *     model that was no longer running them.
 *   - An unrecognised model id fell through to the `unknown` row
 *     (`strictJsonSchema: false`, `needsPromptFormatInstructions: true`) —
 *     silently producing Groq-shaped prompts, with no error.
 *
 * It is also the pattern this project bans: substring/wordlist matching
 * standing in for classification.
 *
 * Resolution is now an exact lookup on the client name, falling back to the
 * operation's configured client — which is what the router itself reads.
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
  /** Benefits from repeating format instructions at the end of long prompts */
  bookending: boolean;
  /** Whether to add format instructions to prompts (not needed with strict schema) */
  needsPromptFormatInstructions: boolean;
}

/**
 * Capability rows.
 *
 * Trimmed to the four fields anything actually reads. The removed
 * fields — `seed`, `logprobs`, `predictedOutputs`, `sandwichPrompting`,
 * `assistantPrefill`, `structuredOutputTemperature` — had no production
 * readers: per-provider request flags are declared on the
 * span provider profiles (ADR-0020), and temperature comes from ModelConfig.
 * Keeping them invited the belief that editing one changed behavior.
 */
const PROVIDER_CAPABILITIES: Record<ProviderType, ProviderCapabilities> = {
  openai: {
    strictJsonSchema: true,
    developerRole: true,
    bookending: true,
    needsPromptFormatInstructions: false, // Strict schema handles it
  },
  groq: {
    // Validation-based JSON schema, not grammar-constrained.
    strictJsonSchema: false,
    developerRole: false,
    bookending: false,
    needsPromptFormatInstructions: true,
  },
  qwen: {
    strictJsonSchema: false,
    developerRole: false,
    bookending: false,
    needsPromptFormatInstructions: true,
  },
  anthropic: {
    strictJsonSchema: false,
    developerRole: false,
    bookending: false,
    needsPromptFormatInstructions: true,
  },
  gemini: {
    strictJsonSchema: true, // Supports responseSchema
    developerRole: false,
    bookending: false,
    needsPromptFormatInstructions: true,
  },
  unknown: {
    strictJsonSchema: false,
    developerRole: false,
    bookending: false,
    needsPromptFormatInstructions: true,
  },
};

/** Registered client name → provider. Exact, not substring. */
const CLIENT_PROVIDERS: Record<string, ProviderType> = {
  openai: "openai",
  groq: "groq",
  qwen: "qwen",
  anthropic: "anthropic",
  gemini: "gemini",
};

/**
 * The provider behind a client name, or `undefined` if it isn't one we know.
 */
function providerForClient(
  client: string | undefined,
): ProviderType | undefined {
  if (!client) return undefined;
  return CLIENT_PROVIDERS[client.trim().toLowerCase()];
}

/**
 * Resolve the provider for a call.
 *
 * Prefer passing the client from `aiService.resolveExecution(operation)`:
 * that is the only value that accounts for availability and circuit state.
 * The operation fallback reads `ModelConfig[operation].client`, the same
 * configuration the router starts from — so it agrees with the router on
 * everything except an active failover.
 */
export function resolveProvider(options: {
  operation?: string | undefined;
  client?: string | undefined;
}): ProviderType {
  const fromClient = providerForClient(options.client);
  if (fromClient) return fromClient;

  const { operation } = options;
  if (operation && isOperationName(operation)) {
    const fromConfig = providerForClient(ModelConfig[operation].client);
    if (fromConfig) return fromConfig;
  }

  return "unknown";
}

export function getProviderCapabilities(
  provider: ProviderType,
): ProviderCapabilities {
  return PROVIDER_CAPABILITIES[provider] || PROVIDER_CAPABILITIES.unknown;
}

/**
 * Resolve provider and capabilities together — the common case.
 *
 * `model` is accepted and ignored: call sites still have it to hand, and
 * taking it keeps them honest that it is NOT what decides the provider.
 */
export function capabilitiesFor(options: {
  operation?: string | undefined;
  model?: string | undefined;
  client?: string | undefined;
}): { provider: ProviderType; capabilities: ProviderCapabilities } {
  const provider = resolveProvider(options);
  return { provider, capabilities: getProviderCapabilities(provider) };
}
