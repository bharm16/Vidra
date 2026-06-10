/**
 * GeminiMessageBuilder - Handles message format conversion for Gemini API
 *
 * Single Responsibility: Convert generic message formats to Gemini's specific
 * payload structure. Changes when Gemini's message format requirements change.
 */

import type {
  CompletionOptions,
  GeminiPayload,
  GeminiContent,
  GeminiMessagesResult,
} from "./types.ts";
import { normalizeGeminiSchema } from "./normalizeGeminiSchema.ts";

export class GeminiMessageBuilder {
  /**
   * Build complete payload for Gemini API request
   */
  buildPayload(
    systemPrompt: string,
    options: CompletionOptions,
  ): GeminiPayload {
    const { systemInstruction, contents } = this.buildMessages(
      systemPrompt,
      options,
    );

    const generationConfig: GeminiPayload["generationConfig"] = {
      temperature:
        options.temperature !== undefined ? options.temperature : 0.7,
      maxOutputTokens: options.maxTokens || 8192,
    };

    // Gemini 2.5+ thinking tokens count against maxOutputTokens; an uncapped
    // budget can consume it and truncate output mid-sentence. Only sent when
    // explicitly configured — eval-gated callers keep the provider default.
    if (options.thinkingBudget !== undefined) {
      generationConfig.thinkingConfig = {
        thinkingBudget: options.thinkingBudget,
      };
    }

    // Only set JSON mode for non-array responses (Gemini limitation)
    if (options.jsonMode && !options.isArray) {
      generationConfig.responseMimeType = "application/json";
    }

    if (options.responseSchema) {
      generationConfig.responseSchema = normalizeGeminiSchema(
        options.responseSchema as Record<string, unknown>,
      );
      // When schema is provided, responseMimeType must be application/json
      generationConfig.responseMimeType = "application/json";
    }

    const payload: GeminiPayload = {
      contents,
      generationConfig,
    };

    if (systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    return payload;
  }

  /**
   * Build messages array and extract system instruction from message history
   *
   * Gemini uses a different message format than OpenAI:
   * - System messages become a separate systemInstruction
   * - 'assistant' role becomes 'model'
   * - Content is wrapped in parts array with {text: string} objects
   */
  buildMessages(
    systemPrompt: string,
    options: CompletionOptions,
  ): GeminiMessagesResult {
    if (options.messages && Array.isArray(options.messages)) {
      return this.buildFromMessageHistory(options);
    }

    return this.buildSimpleMessage(systemPrompt, options);
  }

  /**
   * Build messages from a conversation history
   */
  private buildFromMessageHistory(
    options: CompletionOptions,
  ): GeminiMessagesResult {
    const systemParts: string[] = [];
    const contents: GeminiContent[] = [];

    for (const message of options.messages!) {
      if (message.role === "system") {
        if (message.content) {
          systemParts.push(this.stringifyContent(message.content));
        }
        continue;
      }

      // Map OpenAI-style roles to Gemini roles
      const role = message.role === "assistant" ? "model" : "user";
      const text = this.stringifyContent(message.content);

      contents.push({
        role,
        parts: [{ text }],
      });
    }

    return {
      systemInstruction: systemParts.join("\n").trim(),
      contents: contents.length
        ? contents
        : [
            {
              role: "user",
              parts: [{ text: options.userMessage || "Please proceed." }],
            },
          ],
    };
  }

  /**
   * Build a simple single-message payload
   */
  private buildSimpleMessage(
    systemPrompt: string,
    options: CompletionOptions,
  ): GeminiMessagesResult {
    return {
      systemInstruction: systemPrompt,
      contents: [
        {
          role: "user",
          parts: [{ text: options.userMessage || "Please proceed." }],
        },
      ],
    };
  }

  /**
   * Convert various content formats to a string
   *
   * Handles:
   * - Plain strings
   * - Arrays of strings or objects with text property
   * - Objects with text property
   * - Falls back to JSON.stringify for unknown formats
   */
  stringifyContent(content: unknown): string {
    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((c) =>
          typeof c === "string" ? c : (c as { text?: string })?.text || "",
        )
        .join("");
    }

    if (typeof content === "object" && content !== null) {
      return (content as { text?: string }).text || JSON.stringify(content);
    }

    return "";
  }
}
