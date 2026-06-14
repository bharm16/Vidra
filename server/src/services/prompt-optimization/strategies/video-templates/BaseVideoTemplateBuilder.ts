/**
 * Base Video Template Builder
 *
 * Shared logic for all provider-specific video template builders.
 * Follows the factory pattern established in the Enhancement service.
 *
 * Key Responsibilities:
 * - Define common interface for template generation
 * - Provide shared utilities (XML wrapping, few-shot examples)
 * - Enable provider-specific optimizations via inheritance
 */

import { logger } from "@infrastructure/Logger";
import { wrapUserData } from "@utils/provider/PromptBuilder";
import type { LockedSpan } from "@shared/schemas/optimization.schemas";
import { VIDEO_FEW_SHOT_EXAMPLES } from "../videoPromptOptimizationTemplate";

/**
 * Context for building video templates
 */
export interface VideoTemplateContext {
  /** User's creative concept */
  userConcept: string;
  /** Original user prompt (verbatim), when refining a draft */
  originalUserPrompt?: string | null;
  /** Optional interpreted shot plan from ShotInterpreterService */
  interpretedPlan?: Record<string, unknown> | null;
  /** Whether to include full instructions or just core guidance */
  includeInstructions?: boolean;
  /** Spans that must be preserved in the optimized output */
  lockedSpans?: LockedSpan[];
  /** Generation parameters selected by the user (aspect ratio, duration, etc.) */
  generationParams?: Record<string, string | number | boolean>;
}

/**
 * Result of template building
 * Provider-specific implementations customize what goes where
 */
export interface VideoTemplateResult {
  /** System prompt (creative guidance + methodology) */
  systemPrompt: string;
  /** Developer message for hard constraints (OpenAI only) */
  developerMessage?: string;
  /** User message with XML-wrapped data */
  userMessage: string;
  /** Provider that generated this template */
  provider: "openai" | "groq";
}

/**
 * Base class for video template builders
 *
 * Subclasses implement buildTemplate() with provider-specific optimizations:
 * - OpenAI: Move vocabulary/rules to developerMessage, keep creative guidance in system
 * - Groq: Keep all instructions in system prompt, use sandwich prompting
 */
export abstract class BaseVideoTemplateBuilder {
  protected readonly log = logger.child({
    service: "BaseVideoTemplateBuilder",
  });

  /**
   * Build complete template for video optimization
   *
   * @param context - Video template context
   * @returns Provider-optimized template result
   */
  abstract buildTemplate(context: VideoTemplateContext): VideoTemplateResult;

  /**
   * Wrap user concept and interpreted plan in XML for adversarial safety
   *
   * GPT-4o Best Practices: XML containers prevent prompt injection
   *
   * @protected
   */
  protected wrapUserConcept(
    userConcept: string,
    interpretedPlan?: Record<string, unknown> | null,
    originalUserPrompt?: string | null,
  ): string {
    this.log.debug("Wrapping user concept in XML", {
      operation: "wrapUserConcept",
      hasInterpretedPlan: !!interpretedPlan,
      conceptLength: userConcept.length,
    });

    const fields: Record<string, string> = {
      user_concept: userConcept,
    };

    if (originalUserPrompt) {
      fields.original_user_prompt = originalUserPrompt;
    }

    if (interpretedPlan) {
      fields.interpreted_plan = JSON.stringify(interpretedPlan, null, 2);
    }

    return wrapUserData(fields);
  }

  /**
   * Build interpreted plan description
   *
   * @protected
   */
  protected buildInterpretedPlanText(
    shotPlan: Record<string, unknown> | null,
  ): string {
    if (!shotPlan) {
      return "No interpreted shot plan provided. Keep ONE clear action if present, otherwise focus on camera move + visual focus. Do not invent subjects or actions.";
    }

    return `Pre-interpreted shot plan (do NOT hallucinate missing fields):
- clip_type: ${shotPlan.shot_type || "unknown"} (bucket classification, not framing)
- core_intent: ${shotPlan.core_intent || "n/a"}
- subject: ${shotPlan.subject || "null"}
- action: ${shotPlan.action || "null"}
- visual_focus: ${shotPlan.visual_focus || "null"}
- setting/time: ${shotPlan.setting || "null"} / ${shotPlan.time || "null"}
- camera: move=${shotPlan.camera_move || "null"}, angle=${shotPlan.camera_angle || "null"}
- lighting/style: ${shotPlan.lighting || "null"} / ${shotPlan.style || "null"}
- mood: ${shotPlan.mood || "null"}
If subject or action is null, lean on camera move + visual focus instead of inventing new entities.`;
  }

  /**
   * Get few-shot examples for video optimization
   *
   * These examples teach the model the correct natural language format
   * (avoiding structural arrows and brackets)
   *
   * @protected
   */
  protected getFewShotExamples(): Array<{ role: string; content: string }> {
    return VIDEO_FEW_SHOT_EXAMPLES;
  }
}
