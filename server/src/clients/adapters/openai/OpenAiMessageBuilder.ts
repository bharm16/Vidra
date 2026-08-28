/**
 * OpenAiMessageBuilder - Handles message construction for OpenAI-compatible APIs
 *
 * Single responsibility: Build message arrays and apply prompt strategies
 * like developer-role injection and bookending.
 */

import type { CompletionOptions, OpenAiMessage } from "./types.ts";
import type { MessageContent } from "@interfaces/IAIClient";

// The bookend closer appended on very long prompts. A previous
// extractCriticalInstructions helper claimed to excerpt the system prompt's
// format rules here, but its six regex literals were all double-escaped
// (\\s matches a literal backslash + "s"), so every request since it was
// written received exactly this constant. Deleting the helper and keeping
// the constant is the behavior-preserving form of that discovery.
const BOOKEND_REMINDER =
  "Remember to follow the format constraints defined in the system message.";

export class OpenAiMessageBuilder {
  buildMessages(
    systemPrompt: string,
    options: CompletionOptions,
  ): OpenAiMessage[] {
    if (options.messages && Array.isArray(options.messages)) {
      return this.buildFromMessageHistory(options);
    }

    return this.buildSimpleMessage(systemPrompt, options);
  }

  private buildFromMessageHistory(options: CompletionOptions): OpenAiMessage[] {
    const messages: OpenAiMessage[] = [];

    if (options.developerMessage) {
      messages.push({ role: "developer", content: options.developerMessage });
    }

    messages.push(...options.messages!);

    if (options.enableBookending) {
      const totalTokens = messages.reduce(
        (sum, msg) => sum + this.estimateTokens(msg.content),
        0,
      );
      if (totalTokens > 30000) {
        messages.push({
          role: "user",
          content: `Based on the context above, perform the requested task. ${BOOKEND_REMINDER}`,
        });
      }
    }

    return messages;
  }

  private buildSimpleMessage(
    systemPrompt: string,
    options: CompletionOptions,
  ): OpenAiMessage[] {
    const messages: OpenAiMessage[] = [];

    if (options.developerMessage) {
      messages.push({ role: "developer", content: options.developerMessage });
    }

    messages.push({ role: "system", content: systemPrompt });

    const userMessage = options.userMessage || "Please proceed.";
    messages.push({ role: "user", content: userMessage });

    if (options.enableBookending) {
      const totalTokens = this.estimateTokens(systemPrompt + userMessage);
      if (totalTokens > 30000) {
        messages.push({
          role: "user",
          content: `Based on the context above, perform the requested task. ${BOOKEND_REMINDER}`,
        });
      }
    }

    return messages;
  }

  private estimateTokens(content: MessageContent): number {
    const text = this.stringifyContent(content);
    return Math.ceil(text.length / 4);
  }

  private stringifyContent(content: MessageContent): string {
    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") {
            return part;
          }
          if (part && typeof part === "object") {
            if ("text" in part && typeof part.text === "string") {
              return part.text;
            }
            if (
              "type" in part &&
              part.type === "text" &&
              typeof part.text === "string"
            ) {
              return part.text;
            }
          }
          return "";
        })
        .join("");
    }

    if (content && typeof content === "object") {
      if ("text" in content && typeof content.text === "string") {
        return content.text;
      }
    }

    return "";
  }
}
