/**
 * The LLM clients this server actually registers.
 *
 * `ModelConfig` entries name a `client` (and optionally a `fallbackTo`), and
 * the router resolves those names against the DI-registered clients. Nothing
 * checked the two agreed, so `llm_judge_general` shipped with
 * `client: "anthropic"` — a provider with no adapter, no DI registration and
 * no API key. It did not crash: `ExecutionPlan` silently remapped it to an
 * available provider, which meant the declared judge model
 * (`claude-sonnet-4`) never ran and the entry described something that could
 * not happen.
 *
 * This list is the source the drift gate holds `ModelConfig` to. Adding a
 * provider means adding it here and registering the client in
 * `config/services/llm.services.ts`; the gate fails if config names anything
 * else.
 */

export const REGISTERED_LLM_CLIENTS = [
  "openai",
  "groq",
  "qwen",
  "gemini",
] as const;

export type RegisteredLlmClient = (typeof REGISTERED_LLM_CLIENTS)[number];

export function isRegisteredLlmClient(
  name: string,
): name is RegisteredLlmClient {
  return (REGISTERED_LLM_CLIENTS as readonly string[]).includes(name);
}
