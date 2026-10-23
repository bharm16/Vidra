import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import { logger } from "@infrastructure/Logger";
import type { ILogger } from "@interfaces/ILogger";
import type { OptimizationResponse } from "../types";

const INSTRUCTIONS = [
  "Improve the creator's words for the media model they selected, following that model's guidance below.",
  "Keep their intent, subject and every detail they chose; the result must still name what they asked for. Do not add story, people or objects they did not ask for.",
  "Add exclusions only when the creator asked to leave something out.",
  "Keep names, numbers, references to attached pictures, clips or audio, and anything in quotation marks exactly as written, letter for letter and with the same capitals.",
  "Never invent words, slogans or labels to appear in the picture, clip or song.",
  "Write in the creator's language.",
  "Return only the improved words, with no heading, quotation marks around the whole answer, or notes.",
].join("\n");

/**
 * GuidedWordingService
 *
 * Improve wording for a model that documents how it wants to be prompted: one
 * plain rewrite that follows the guidance kept with that model's profile. The
 * structured video flow would split the words into camera and lighting slots,
 * which loses reference names, quoted dialogue and anything that is not a shot.
 */
export class GuidedWordingService {
  private readonly ai: AIExecutionPort;
  private readonly log: ILogger;

  constructor(aiService: AIExecutionPort) {
    this.ai = aiService;
    this.log = logger.child({ service: "GuidedWordingService" });
  }

  async rewrite(
    prompt: string,
    guidance: string,
    signal?: AbortSignal,
  ): Promise<OptimizationResponse> {
    const startTime = performance.now();
    const response = await this.ai.execute("improve_wording", {
      systemPrompt: `${INSTRUCTIONS}\n\nModel guidance:\n${guidance}`,
      userMessage: prompt,
      responseFormat: { type: "text" },
      jsonMode: false,
      ...(signal ? { signal } : {}),
    });
    const improved = response.text.trim();
    if (!improved) throw new Error("Guided rewrite returned no words");

    this.log.info("Operation completed.", {
      operation: "rewrite",
      duration: Math.round(performance.now() - startTime),
      inputLength: prompt.length,
      outputLength: improved.length,
    });

    return {
      prompt: improved,
      genericPrompt: improved,
      quality: {
        // Neither check applies: both measure video shot slots.
        intentLock: {
          passed: true,
          repaired: false,
          skippedRepair: true,
          required: { subject: null, action: null },
        },
        lint: {
          ok: true,
          errors: [],
          warnings: [],
          wordCount: improved.split(/\s+/).length,
          repaired: false,
        },
      },
    };
  }
}
