import Anthropic from "@anthropic-ai/sdk";
import { APIError, TimeoutError, ClientAbortError } from "../LLMClient.ts";
import type { LLMAdapter } from "@interfaces/ILLMAdapter";
import type { AIResponse, CompletionOptions } from "@interfaces/IAIClient";

/**
 * Plain-text completions through the Anthropic Messages API.
 *
 * Text only: an operation that needs JSON or a schema is refused rather than
 * answered as prose. Temperature is never sent; current Claude models reject
 * sampling parameters. Effort comes from the operation's config; without one
 * the model's own default applies. Retries and fallback belong to the router,
 * so the SDK makes one attempt.
 */
export class AnthropicAdapter implements LLMAdapter<CompletionOptions> {
  private readonly client: Anthropic;
  private readonly defaultModel: string;
  private readonly defaultTimeout: number;
  public readonly capabilities = { streaming: false };

  constructor({
    apiKey,
    defaultModel,
    defaultTimeout = 30000,
  }: {
    apiKey: string;
    defaultModel: string;
    defaultTimeout?: number;
  }) {
    this.client = new Anthropic({ apiKey, maxRetries: 0 });
    this.defaultModel = defaultModel;
    this.defaultTimeout = defaultTimeout;
  }

  async complete(
    systemPrompt: string,
    options: CompletionOptions = {},
  ): Promise<AIResponse> {
    if (options.jsonMode || options.schema) {
      throw new APIError("The Anthropic adapter returns plain text only", 400, false);
    }
    const messages: Anthropic.MessageParam[] = options.userMessage
      ? [{ role: "user", content: options.userMessage }]
      : (options.messages ?? []).flatMap((message) =>
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string"
            ? [{ role: message.role, content: message.content }]
            : [],
        );
    const model = options.model || this.defaultModel;

    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create(
        {
          model,
          max_tokens: options.maxTokens ?? 4000,
          system: systemPrompt,
          messages,
          ...(options.effort ? { output_config: { effort: options.effort } } : {}),
        },
        {
          timeout: options.timeout ?? this.defaultTimeout,
          ...(options.signal ? { signal: options.signal } : {}),
        },
      );
    } catch (error) {
      if (error instanceof Anthropic.APIUserAbortError) {
        throw new ClientAbortError("Anthropic request aborted by client");
      }
      if (error instanceof Anthropic.APIConnectionTimeoutError) {
        throw new TimeoutError(`Anthropic request timeout after ${options.timeout ?? this.defaultTimeout}ms`);
      }
      if (error instanceof Anthropic.APIError) {
        const status = error.status ?? 500;
        throw new APIError(`Anthropic API error: ${error.message}`, status, status === 429 || status >= 500);
      }
      throw error;
    }

    if (response.stop_reason === "refusal") {
      throw new APIError("Anthropic declined the request", 422, false);
    }
    // Thinking blocks come first on current models; only text is the answer.
    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");

    return {
      text,
      content: [{ text }],
      metadata: {
        model: response.model,
        provider: "anthropic",
        ...(response.stop_reason ? { finishReason: response.stop_reason } : {}),
        usage: response.usage,
        requestId: response.id,
      },
    };
  }
}
