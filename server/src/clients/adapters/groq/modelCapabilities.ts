/**
 * What each Groq-hosted Llama model can be asked for.
 *
 * This replaces a substring test on the model id
 * (`!name.includes("instant") && !name.includes("8b") && (name.includes("70b")
 * || name.includes("versatile"))`) that decided, at request time, whether to
 * send `logprobs`. Reading capabilities out of the spelling of a name is the
 * pattern this codebase removed from provider detection; it fails silently in
 * both directions — a capable model whose name lacks the magic tokens loses
 * logprobs with no signal, and a future `…-70b-…` without support gets a 400.
 *
 * A model absent from this table is treated as not supporting the capability:
 * asking Groq for an unsupported parameter is an API error, so the
 * conservative answer is the safe one until the model is declared here.
 */
interface GroqModelCapabilities {
  /** Token-level confidence. Only the larger models serve it. */
  logprobs: boolean;
}

const GROQ_MODEL_CAPABILITIES: Readonly<Record<string, GroqModelCapabilities>> =
  {
    "llama-3.1-8b-instant": { logprobs: false },
    "llama-3.3-70b-versatile": { logprobs: true },
  };

export function supportsLogprobs(modelId: string): boolean {
  return GROQ_MODEL_CAPABILITIES[modelId]?.logprobs ?? false;
}
