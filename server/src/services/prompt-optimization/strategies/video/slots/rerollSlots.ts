import type { AIService } from "@services/prompt-optimization/types";
import {
  parseVideoPromptStructuredResponse,
  type VideoPromptStructuredResponse,
  type VideoPromptSlots,
} from "@services/prompt-optimization/strategies/videoPromptTypes";
import {
  lintVideoPromptSlots,
  mergeLintResults,
} from "../../videoPromptLinter";
import { normalizeSlots } from "./normalizeSlots";
import { scoreSlots } from "./scoreSlots";

export async function rerollSlots(options: {
  ai: AIService;
  templateSystemPrompt: string;
  developerMessage?: string;
  schema: Record<string, unknown>;
  messages: Array<{ role: string; content: string }>;
  config: { maxTokens: number; temperature: number; timeout: number };
  baseSeed: number;
  attempts?: number;
  signal?: AbortSignal;
}): Promise<VideoPromptStructuredResponse | null> {
  const attempts = Math.max(0, Math.min(options.attempts ?? 2, 4));
  if (attempts === 0) return null;

  type Candidate = {
    parsed: VideoPromptStructuredResponse;
    slots: VideoPromptSlots;
    score: number;
  };
  const candidates: Candidate[] = [];

  for (let i = 0; i < attempts; i++) {
    const seed = (options.baseSeed + i + 1) % 2147483647;
    try {
      const response = await options.ai.execute("optimize_standard", {
        systemPrompt: options.templateSystemPrompt,
        messages: options.messages,
        schema: options.schema,
        ...(options.developerMessage
          ? { developerMessage: options.developerMessage }
          : {}),
        maxTokens: options.config.maxTokens,
        temperature: 0.2,
        timeout: options.config.timeout,
        seed,
        ...(options.signal ? { signal: options.signal } : {}),
      });

      const parsed = parseVideoPromptStructuredResponse(response.text);
      const slots = normalizeSlots(parsed);
      const lint = mergeLintResults(
        lintVideoPromptSlots(parsed),
        lintVideoPromptSlots(slots),
      );
      if (!lint.ok) {
        continue;
      }

      candidates.push({
        parsed: { ...parsed, ...slots },
        slots,
        score: scoreSlots(slots),
      });
    } catch {
      // Ignore and continue trying other seeds.
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]!.parsed;
}
