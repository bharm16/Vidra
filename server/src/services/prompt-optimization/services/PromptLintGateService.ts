import { logger } from "@infrastructure/Logger";
import type { ModelConstraints } from "@server/contracts/prompt-analysis/modelConstraints";
import { resolvePromptModelId } from "@config/videoModelRegistry";
import { getPromptModelConstraints } from "@shared/videoModels";

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\*\*TECHNICAL SPECS\*\*/i,
    message: "Contains technical specs markdown section.",
  },
  {
    pattern: /\*\*ALTERNATIVE APPROACHES\*\*/i,
    message: "Contains alternative approaches markdown section.",
  },
  { pattern: /^\s*#{1,6}\s+/m, message: "Contains markdown heading syntax." },
  {
    pattern: /\bVariation\s+\d+\b/i,
    message: "Contains template variation artifact.",
  },
];

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function sanitizeMarkdownArtifacts(prompt: string): string {
  let cleaned = prompt.trim();
  const markers = [
    /\r?\n\s*\*\*\s*technical specs\s*\*\*/i,
    /\r?\n\s*\*\*\s*alternative approaches\s*\*\*/i,
    /\r?\n\s*technical specs\s*[:\n]/i,
    /\r?\n\s*alternative approaches\s*[:\n]/i,
  ];

  let cutIndex = -1;
  for (const marker of markers) {
    const match = marker.exec(cleaned);
    if (match && (cutIndex === -1 || match.index < cutIndex)) {
      cutIndex = match.index;
    }
  }

  if (cutIndex >= 0) {
    cleaned = cleaned.slice(0, cutIndex).trim();
  }

  return cleaned
    .replace(/^\s*\*\*\s*prompt\s*:\s*\*\*/i, "")
    .replace(/^\s*prompt\s*:\s*/i, "")
    .replace(/\b(in\s+(?:a|an|the)\s+car)\s+\1\b/gi, "$1")
    .trim();
}

/**
 * A model's hard word budget was exceeded. Typed rather than left as one string
 * among many in `errors`, because this is the one lint outcome with a
 * downstream cost: the provider truncates the prompt after the spend. Callers
 * that surface it can warn before generating; callers that ignore it at least
 * cannot claim they were not told.
 */
export interface PromptLintOverBudget {
  modelId: string;
  wordCount: number;
  limit: number;
}

export interface PromptLintResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  wordCount: number;
  overBudget?: PromptLintOverBudget;
}

export interface PromptLintSanitizeResult {
  prompt: string;
  lint: PromptLintResult;
  repaired: boolean;
}

interface PromptLintGateServiceOptions {
  getModelConstraints?: (modelId: string) => ModelConstraints | undefined;
}

export class PromptLintGateService {
  private readonly getModelConstraints: (
    modelId: string,
  ) => ModelConstraints | undefined;
  private readonly log = logger.child({ service: "PromptLintGateService" });

  constructor(options: PromptLintGateServiceOptions = {}) {
    this.getModelConstraints =
      options.getModelConstraints ??
      ((modelId: string) => getPromptModelConstraints(modelId));
  }

  private resolveLimits(
    modelId?: string | null,
  ): ModelConstraints["wordLimits"] | undefined {
    if (!modelId) {
      return undefined;
    }

    const normalizedModelId = resolvePromptModelId(modelId) ?? modelId;
    return this.getModelConstraints(normalizedModelId)?.wordLimits;
  }

  evaluate(prompt: string, modelId?: string | null): PromptLintResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const wordCount = countWords(prompt);
    let overBudget: PromptLintOverBudget | undefined;

    for (const rule of FORBIDDEN_PATTERNS) {
      if (rule.pattern.test(prompt)) {
        errors.push(rule.message);
      }
    }

    const limits = this.resolveLimits(modelId);
    if (limits && modelId) {
      if (wordCount > limits.max) {
        errors.push(
          `Prompt too long for ${modelId} (${wordCount} words > ${limits.max}).`,
        );
        overBudget = { modelId, wordCount, limit: limits.max };
      } else if (wordCount < limits.min) {
        warnings.push(
          `Prompt short for ${modelId} (${wordCount} words < ${limits.min}).`,
        );
      }
    }

    return {
      ok: errors.length === 0,
      errors,
      warnings,
      wordCount,
      ...(overBudget ? { overBudget } : {}),
    };
  }

  /**
   * Strip template artifacts and report what remains. Deliberately non-fatal —
   * see the sanitize-then-warn regression suite: throwing here 500s a request
   * whose LLM spend has already happened. The name says sanitize because that is
   * all this does; enforcement, if any, belongs to whoever reads `lint`.
   */
  sanitize(params: {
    prompt: string;
    modelId?: string | null;
  }): PromptLintSanitizeResult {
    const originalPrompt = params.prompt.trim();
    const candidate = sanitizeMarkdownArtifacts(originalPrompt);

    const lint = this.evaluate(candidate, params.modelId);
    // The budget violation contributes exactly one error, so anything beyond it
    // is a formatting problem. Counted rather than re-matched: this used to sniff
    // its own message prefix.
    const nonLengthErrorCount = lint.errors.length - (lint.overBudget ? 1 : 0);
    const hasOnlyLengthError =
      Boolean(lint.overBudget) && nonLengthErrorCount === 0;

    if (hasOnlyLengthError) {
      this.log.error(
        "Model-specific prompt exceeded word budget; returning unchanged prompt",
        undefined,
        {
          modelId: resolvePromptModelId(params.modelId) ?? params.modelId,
          wordCount: lint.wordCount,
          errors: lint.errors,
        },
      );
      return {
        prompt: candidate,
        lint,
        repaired: candidate !== originalPrompt,
      };
    }

    if (!lint.ok) {
      this.log.warn(
        "Prompt lint gate detected non-length issues after sanitize; returning sanitized prompt to avoid post-spend failure.",
        {
          modelId: params.modelId
            ? (resolvePromptModelId(params.modelId) ?? params.modelId)
            : null,
          wordCount: lint.wordCount,
          errors: lint.errors,
        },
      );
    }

    return {
      prompt: candidate,
      lint,
      repaired: candidate !== originalPrompt,
    };
  }
}
