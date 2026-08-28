import { calculateMaxTokens } from "./contextBudget";
import { isDeclaredGroqModel, supportsLogprobs } from "./modelCapabilities";
import { normalizeOpenAiSchema } from "../openai/normalizeSchema";
import type { LlamaCompletionOptions } from "./types";
import { hashString } from "@utils/hash";

type LlamaMessage = { role: string; content: string };

/**
 * Models seen without a capability entry. Reported once each so an undeclared
 * model shows up in logs instead of quietly losing a capability.
 */
const undeclaredModels = new Set<string>();

export function takeUndeclaredGroqModels(): string[] {
  const seen = [...undeclaredModels];
  undeclaredModels.clear();
  return seen;
}

export interface GroqPayloadInput {
  systemPrompt: string;
  /** Built by `buildLlamaMessages`. May be mutated to satisfy json_object mode. */
  messages: LlamaMessage[];
  options: LlamaCompletionOptions;
  defaultModel: string;
  /** The streaming path sets `stream: true` and never asks for logprobs. */
  stream: boolean;
}

export interface GroqPayloadResult {
  payload: Record<string, unknown>;
  /**
   * Whether the JSON instruction had to be prepended for json_object mode. The
   * adapter logs it; the builder stays free of transport concerns.
   */
  injectedJsonInstruction: boolean;
}

/**
 * Build the Groq chat-completions payload.
 *
 * One builder for both entry points. `complete` and `streamComplete` each held
 * their own copy of every rule below — temperature defaults, the max_tokens
 * budget, the structured-output seed, top_p, the penalties, the four stop
 * sequences, and the whole json_object instruction-injection block — with the
 * streaming copy annotated "same logic as _executeRequest" to mark what had to
 * be kept in step by hand. Its sibling `OpenAICompatibleAdapter` already shares
 * one `OpenAiRequestBuilder` between its two paths; this is the same shape.
 *
 * The parameter rules come from the Llama 3 guidance the adapter has always
 * cited: temperature 0.1 for extraction and 0.7 for chat (never 0.0), max_tokens
 * set aggressively to prevent runaway generation, repetition penalties disabled
 * for JSON so structural tokens may repeat, and stop sequences that halt
 * markdown fences and conversational postambles at the token level. `min_p` is
 * deliberately absent: Groq returns 400 for it.
 */
export function buildGroqPayload({
  systemPrompt,
  messages,
  options,
  defaultModel,
  stream,
}: GroqPayloadInput): GroqPayloadResult {
  const model = options.model || defaultModel;
  const isStructuredOutput = !!(
    options.schema ||
    options.responseFormat ||
    options.jsonMode
  );

  const payload: Record<string, unknown> = {
    model,
    messages,
    max_tokens: calculateMaxTokens(
      isStructuredOutput,
      options.maxTokens,
      options.expectedOutputSize,
    ),
    temperature:
      options.temperature !== undefined
        ? options.temperature
        : isStructuredOutput
          ? 0.1
          : 0.7,
    top_p: isStructuredOutput ? 0.95 : 0.9,
  };

  if (stream) {
    payload.stream = true;
  }

  // Same seed + same input = deterministic output, which is what makes a
  // structured response cacheable and a failure reproducible.
  if (options.seed !== undefined) {
    payload.seed = options.seed;
  } else if (isStructuredOutput) {
    payload.seed = hashString(systemPrompt) % 2147483647;
  }

  if (isStructuredOutput) {
    payload.frequency_penalty = 0;
    payload.presence_penalty = 0;
    // Groq accepts at most 4: markdown fences, runaway whitespace, and the two
    // most common postambles.
    payload.stop = ["```", "\n\n\n", "Note:", "I hope"];
  }

  // Streaming has never requested logprobs; only the buffered path consumes
  // them (see logprobConfidence).
  if (options.logprobs && !stream) {
    if (supportsLogprobs(model)) {
      payload.logprobs = true;
      payload.top_logprobs = options.topLogprobs ?? 3;
    } else if (!isDeclaredGroqModel(model)) {
      // GROQ_MODEL is an arbitrary env string, so a model can reach here
      // without an entry. Dropping logprobs is the safe answer, but doing it
      // silently is what made the old substring test hard to notice.
      undeclaredModels.add(model);
    }
  }

  let injectedJsonInstruction = false;

  if (options.schema) {
    // Groq's json_schema mode is OpenAI-compatible; the previous inline
    // unwrap skipped normalization and shipped $schema/$id to the provider.
    const normalized = normalizeOpenAiSchema(
      options.schema as Record<string, unknown>,
    );
    payload.response_format = {
      type: "json_schema",
      json_schema: {
        name: normalized.name,
        schema: normalized.schema,
      },
    };
  } else if (options.responseFormat?.type === "json_schema") {
    payload.response_format = options.responseFormat;
  } else if (
    options.responseFormat?.type === "json_object" ||
    (options.jsonMode && !options.isArray)
  ) {
    // Groq rejects json_object mode unless 'json' appears in the messages.
    const messagesContainJson = messages.some((m) =>
      m.content.toLowerCase().includes("json"),
    );

    if (!messagesContainJson) {
      injectedJsonInstruction = true;
      const systemIdx = messages.findIndex((m) => m.role === "system");
      const systemMessage = systemIdx >= 0 ? messages[systemIdx] : undefined;
      if (systemMessage) {
        systemMessage.content = `Respond with valid JSON.\n\n${systemMessage.content}`;
      } else if (messages[0]) {
        messages[0].content = `Respond with valid JSON.\n\n${messages[0].content}`;
      } else {
        messages.push({ role: "system", content: "Respond with valid JSON." });
      }
    }

    payload.response_format = options.responseFormat || { type: "json_object" };
  } else if (options.responseFormat) {
    payload.response_format = options.responseFormat;
  }

  return { payload, injectedJsonInstruction };
}
