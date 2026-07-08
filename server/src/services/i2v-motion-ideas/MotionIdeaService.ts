/**
 * MotionIdeaService
 *
 * Translates an `ImageObservation` into 3-5 short motion phrases the user
 * can pick from when adding motion to a still image (I2V).
 *
 * Thin orchestrator: resolves an observation (caller-supplied or via
 * `ImageObservationService`), runs a single AI pass, validates the JSON
 * shape, and clamps to MIN_IDEAS..MAX_IDEAS. Any failure path returns
 * the static fallback phrases so the UI is never empty.
 */

import { promises as fs } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { logger } from "@infrastructure/Logger";
import type { AIExecutionPort as AIService } from "@services/ai-model/ports/AIExecutionPort";
import type { ImageObservationService } from "@services/image-observation/ImageObservationService";
import type { MotionIdeaRequest, MotionIdeaResponse } from "./types";
import { MOTION_IDEAS_FALLBACK } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATE_PATH = join(__dirname, "templates", "motion-ideas-prompt.md");

const MAX_IDEAS = 5;
const MIN_IDEAS = 3;
const DEFAULT_TEMPERATURE = 0.4;

const ResponseSchema = z.object({
  ideas: z.array(z.string()).min(1),
});

export class MotionIdeaService {
  private static cachedTemplate: string | null = null;
  private readonly ai: AIService;
  private readonly observationService: ImageObservationService;
  private readonly log = logger.child({ service: "MotionIdeaService" });

  constructor(ai: AIService, observationService: ImageObservationService) {
    this.ai = ai;
    this.observationService = observationService;
  }

  async generate(request: MotionIdeaRequest): Promise<MotionIdeaResponse> {
    const startedAt = performance.now();

    let observation = request.observation ?? null;
    let observationCached = false;
    let observationUsedFastPath = false;

    if (!observation) {
      try {
        const observeResult = await this.observationService.observe({
          image: request.image,
          ...(request.sourcePrompt
            ? { sourcePrompt: request.sourcePrompt }
            : {}),
          ...(request.skipCache !== undefined
            ? { skipCache: request.skipCache }
            : {}),
        });
        if (!observeResult.success || !observeResult.observation) {
          return this.fallback(startedAt);
        }
        observation = observeResult.observation;
        observationCached = observeResult.cached;
        observationUsedFastPath = observeResult.usedFastPath;
      } catch (error) {
        this.log.warn("Image observation failed; returning fallback ideas", {
          error: error instanceof Error ? error.message : String(error),
        });
        return this.fallback(startedAt);
      }
    }

    const template = await this.loadTemplate();
    // observedAt is capture bookkeeping, not scene content — embedding it
    // makes the prompt non-deterministic (busts provider prompt caching and
    // record/replay matching) without giving the model anything to use.
    const { observedAt: _observedAt, ...promptObservation } = observation;
    const systemPrompt = template.replace(
      "{{observation}}",
      JSON.stringify(promptObservation, null, 2),
    );

    try {
      const response = await this.ai.execute("i2v_motion_ideas", {
        systemPrompt,
        userMessage: "Generate motion ideas now.",
        maxTokens: 200,
        temperature:
          typeof request.temperature === "number"
            ? request.temperature
            : DEFAULT_TEMPERATURE,
        jsonMode: true,
      });

      const ideas = this.parseAndClamp(response.text);
      if (ideas.length === 0) {
        return this.fallback(
          startedAt,
          observationCached,
          observationUsedFastPath,
        );
      }

      return {
        ideas,
        observationCached,
        observationUsedFastPath,
        durationMs: Math.round(performance.now() - startedAt),
      };
    } catch (error) {
      this.log.warn("Motion-idea LLM pass failed; returning fallback", {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.fallback(
        startedAt,
        observationCached,
        observationUsedFastPath,
      );
    }
  }

  private parseAndClamp(text: string): string[] {
    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return [];
    }
    const validated = ResponseSchema.safeParse(parsed);
    if (!validated.success) return [];

    const ideas = validated.data.ideas
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (ideas.length < MIN_IDEAS) return [];
    return ideas.slice(0, MAX_IDEAS);
  }

  private async loadTemplate(): Promise<string> {
    if (MotionIdeaService.cachedTemplate) {
      return MotionIdeaService.cachedTemplate;
    }
    const content = await fs.readFile(TEMPLATE_PATH, "utf-8");
    MotionIdeaService.cachedTemplate = content;
    return content;
  }

  private fallback(
    startedAt: number,
    observationCached = false,
    observationUsedFastPath = false,
  ): MotionIdeaResponse {
    return {
      ideas: [...MOTION_IDEAS_FALLBACK],
      observationCached,
      observationUsedFastPath,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }
}
