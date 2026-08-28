/**
 * ImageObservationService
 *
 * Extracts lightweight observations from images for i2v filtering/warnings.
 * NOT for building prompts - just for constraining suggestions.
 */

import { logger } from "@infrastructure/Logger";
import { assertUrlSafe } from "@server/shared/urlValidation";
import { sha256Hex } from "@utils/hash";
import { promises as fs } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  SHOT_TYPES,
  CAMERA_ANGLES,
  LIGHTING_QUALITIES,
  SUBJECT_POSITIONS,
} from "@shared/cinematography";
import type { AIExecutionPort as AIService } from "@services/ai-model/ports/AIExecutionPort";
import { z } from "zod";
import type { CacheService } from "@services/cache/CacheService";
import {
  deriveMotionCompatibility,
  detectAngle,
  detectLightingQuality,
  detectShotType,
  detectSubjectType,
  detectTimeOfDay,
  extractSubjectDescription,
} from "./imageObservationHeuristics";
import type {
  ImageObservation,
  ImageObservationRequest,
  ImageObservationResult,
  SubjectObservation,
  FramingObservation,
  LightingObservation,
} from "./types";

type ImageObservationResponse = {
  subject?:
    | {
        type?: SubjectObservation["type"] | undefined;
        description?: string | undefined;
        position?: SubjectObservation["position"] | undefined;
      }
    | undefined;
  framing?:
    | {
        shotType?: FramingObservation["shotType"] | undefined;
        angle?: FramingObservation["angle"] | undefined;
      }
    | undefined;
  lighting?:
    | {
        quality?: LightingObservation["quality"] | undefined;
        timeOfDay?: LightingObservation["timeOfDay"] | undefined;
      }
    | undefined;
  confidence?: number | undefined;
};

const SUBJECT_TYPES = [
  "person",
  "animal",
  "object",
  "scene",
  "abstract",
] as const;
const TIME_OF_DAY_VALUES = [
  "day",
  "night",
  "golden-hour",
  "blue-hour",
  "indoor",
  "unknown",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined =>
  typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;

const ImageObservationResponseSchema = z
  .object({
    subject: z
      .object({
        type: z.string().optional(),
        description: z.string().optional(),
        position: z.string().optional(),
      })
      .partial()
      .optional(),
    framing: z
      .object({
        shotType: z.string().optional(),
        angle: z.string().optional(),
      })
      .partial()
      .optional(),
    lighting: z
      .object({
        quality: z.string().optional(),
        timeOfDay: z.string().optional(),
      })
      .partial()
      .optional(),
    confidence: z.number().optional(),
  })
  .passthrough();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATE_PATH = join(
  __dirname,
  "templates",
  "image-observation-prompt.md",
);

const DEFAULT_SYSTEM_PROMPT = [
  "Analyze this image for video generation constraints.",
  "Return JSON only (no markdown, no extra text).",
  "",
  "{",
  '  "subject": {',
  '    "type": "person|animal|object|scene|abstract",',
  '    "description": "brief description (10 words max)",',
  '    "position": "center|left|right|top|bottom|left-third|right-third"',
  "  },",
  '  "framing": {',
  '    "shotType": "extreme-close-up|close-up|medium-close-up|medium|medium-wide|wide|extreme-wide",',
  '    "angle": "eye-level|low-angle|high-angle|birds-eye|worms-eye|dutch|over-shoulder"',
  "  },",
  '  "lighting": {',
  '    "quality": "natural|artificial|dramatic|flat|mixed",',
  '    "timeOfDay": "day|night|golden-hour|blue-hour|indoor|unknown"',
  "  },",
  '  "confidence": 0.0-1.0',
  "}",
  "",
  "Be precise. Only describe what you clearly see.",
].join("\n");

const OBSERVATION_CACHE_NAMESPACE = "image-observation";
const OBSERVATION_CACHE_TTL_SECONDS = 86400;

export class ImageObservationService {
  private static cachedPrompt: string | null = null;
  private readonly ai: AIService;
  private readonly cacheService: Pick<CacheService, "get" | "set">;
  private readonly log = logger.child({ service: "ImageObservationService" });

  constructor(aiService: AIService, cacheService: CacheService) {
    this.ai = aiService;
    this.cacheService = cacheService;
  }

  // CacheService is NodeCache-backed (in-process, cannot throw on get/set);
  // a previous ObservationCache wrapper layered a second in-memory Map and
  // unreachable "Redis unavailable" handlers over it — deleted (audit run 4).
  private async readCache(imageHash: string): Promise<ImageObservation | null> {
    return await this.cacheService.get<ImageObservation>(
      `${OBSERVATION_CACHE_NAMESPACE}:${imageHash}`,
    );
  }

  private async writeCache(
    imageHash: string,
    observation: ImageObservation,
  ): Promise<void> {
    await this.cacheService.set(
      `${OBSERVATION_CACHE_NAMESPACE}:${imageHash}`,
      observation,
      { ttl: OBSERVATION_CACHE_TTL_SECONDS },
    );
  }

  /**
   * Observe an image and extract filtering/warning data
   */
  async observe(
    request: ImageObservationRequest,
  ): Promise<ImageObservationResult> {
    const startTime = performance.now();
    const imageHash = this.hashImage(request.image);

    if (!request.skipCache) {
      const cached = await this.readCache(imageHash);
      if (cached) {
        return {
          success: true,
          observation: cached,
          cached: true,
          usedFastPath: false,
          durationMs: Math.round(performance.now() - startTime),
        };
      }
    }

    if (request.sourcePrompt) {
      const observation = this.parseSourcePrompt(
        request.sourcePrompt,
        imageHash,
      );
      await this.writeCache(imageHash, observation);
      return {
        success: true,
        observation,
        cached: false,
        usedFastPath: true,
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    try {
      const observation = await this.analyzeWithVision(
        request.image,
        imageHash,
      );
      await this.writeCache(imageHash, observation);
      return {
        success: true,
        observation,
        cached: false,
        usedFastPath: false,
        durationMs: Math.round(performance.now() - startTime),
      };
    } catch (error) {
      this.log.warn(
        "Vision analysis unavailable, returning fallback observation",
        {
          error: (error as Error).message,
        },
      );
      const fallback = this.buildFallbackObservation(imageHash);
      return {
        success: true,
        observation: fallback,
        cached: false,
        usedFastPath: false,
        durationMs: Math.round(performance.now() - startTime),
      };
    }
  }

  private hashImage(image: string): string {
    return sha256Hex(image);
  }

  /**
   * Fast path: parse observation from source prompt (no vision call)
   */
  private parseSourcePrompt(
    prompt: string,
    imageHash: string,
  ): ImageObservation {
    const lower = prompt.toLowerCase();

    const subject: SubjectObservation = {
      type: detectSubjectType(lower),
      description: extractSubjectDescription(prompt),
      position: "center",
      confidence: 0.7,
    };

    const framing: FramingObservation = {
      shotType: detectShotType(lower),
      angle: detectAngle(lower),
      confidence: 0.6,
    };

    const lighting: LightingObservation = {
      quality: detectLightingQuality(lower),
      timeOfDay: detectTimeOfDay(lower),
      confidence: 0.6,
    };

    const motion = deriveMotionCompatibility(framing, subject.position);

    return {
      imageHash,
      observedAt: new Date(),
      subject,
      framing,
      lighting,
      motion,
      confidence: 0.6,
    };
  }

  /**
   * Vision path: analyze with multimodal model
   */
  private async analyzeWithVision(
    image: string,
    imageHash: string,
  ): Promise<ImageObservation> {
    const systemPrompt = await this.loadSystemPrompt();

    // Convert URL to base64 data URI to avoid GCS signed URL expiration issues
    this.log.debug("Fetching image for base64 conversion", { imageHash });
    assertUrlSafe(image, "imageObservationUrl");
    const imageResponse = await fetch(image);
    if (!imageResponse.ok) {
      throw new Error(
        `Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`,
      );
    }
    const contentType =
      imageResponse.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64String = Buffer.from(arrayBuffer).toString("base64");
    const base64DataUri = `data:${contentType};base64,${base64String}`;

    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze the image and return JSON." },
          { type: "image_url", image_url: { url: base64DataUri } },
        ],
      },
    ];

    const response = await this.ai.execute("image_observation", {
      systemPrompt,
      messages,
      maxTokens: 600,
      temperature: 0.1,
      jsonMode: true,
      enableBookending: false,
    });

    const parsed = this.parseJsonResponse(response.text);

    const subject: SubjectObservation = {
      type: parsed.subject?.type || "object",
      description: parsed.subject?.description || "subject",
      position: parsed.subject?.position || "center",
      confidence: parsed.confidence || 0.8,
    };

    const framing: FramingObservation = {
      shotType: parsed.framing?.shotType || "medium",
      angle: parsed.framing?.angle || "eye-level",
      confidence: parsed.confidence || 0.8,
    };

    const lighting: LightingObservation = {
      quality: parsed.lighting?.quality || "natural",
      timeOfDay: parsed.lighting?.timeOfDay || "unknown",
      confidence: parsed.confidence || 0.8,
    };

    const motion = deriveMotionCompatibility(framing, subject.position);

    return {
      imageHash,
      observedAt: new Date(),
      subject,
      framing,
      lighting,
      motion,
      confidence: parsed.confidence || 0.8,
    };
  }

  private buildFallbackObservation(imageHash: string): ImageObservation {
    const framing: FramingObservation = {
      shotType: "medium",
      angle: "eye-level",
      confidence: 0.2,
    };
    const subject: SubjectObservation = {
      type: "object",
      description: "subject",
      position: "center",
      confidence: 0.2,
    };
    const lighting: LightingObservation = {
      quality: "natural",
      timeOfDay: "unknown",
      confidence: 0.2,
    };
    const motion = deriveMotionCompatibility(framing, subject.position);
    return {
      imageHash,
      observedAt: new Date(),
      subject,
      framing,
      lighting,
      motion,
      confidence: 0.2,
    };
  }

  private parseJsonResponse(text: string): ImageObservationResponse {
    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    try {
      const parsed = JSON.parse(cleaned);
      const validated = ImageObservationResponseSchema.safeParse(parsed);
      if (!validated.success) {
        this.log.warn("Invalid image observation JSON response", {
          error: validated.error.message,
        });
        return {};
      }
      return this.coerceJsonResponse(validated.data);
    } catch {
      return {};
    }
  }

  private coerceJsonResponse(value: unknown): ImageObservationResponse {
    if (!isRecord(value)) {
      return {};
    }

    const subjectValue = isRecord(value.subject) ? value.subject : undefined;
    const framingValue = isRecord(value.framing) ? value.framing : undefined;
    const lightingValue = isRecord(value.lighting) ? value.lighting : undefined;

    const subject: ImageObservationResponse["subject"] | undefined =
      subjectValue
        ? {
            type: asEnum(subjectValue.type, SUBJECT_TYPES),
            description:
              typeof subjectValue.description === "string"
                ? subjectValue.description
                : undefined,
            position: asEnum(subjectValue.position, SUBJECT_POSITIONS),
          }
        : undefined;

    const framing: ImageObservationResponse["framing"] | undefined =
      framingValue
        ? {
            shotType: asEnum(framingValue.shotType, SHOT_TYPES),
            angle: asEnum(framingValue.angle, CAMERA_ANGLES),
          }
        : undefined;

    const lighting: ImageObservationResponse["lighting"] | undefined =
      lightingValue
        ? {
            quality: asEnum(lightingValue.quality, LIGHTING_QUALITIES),
            timeOfDay: asEnum(lightingValue.timeOfDay, TIME_OF_DAY_VALUES),
          }
        : undefined;

    return {
      subject,
      framing,
      lighting,
      confidence:
        typeof value.confidence === "number" ? value.confidence : undefined,
    };
  }

  private async loadSystemPrompt(): Promise<string> {
    if (ImageObservationService.cachedPrompt) {
      return ImageObservationService.cachedPrompt;
    }

    try {
      const content = await fs.readFile(TEMPLATE_PATH, "utf-8");
      const trimmed = content.trim();
      ImageObservationService.cachedPrompt =
        trimmed.length > 0 ? trimmed : DEFAULT_SYSTEM_PROMPT;
    } catch (error) {
      this.log.warn(
        "Image observation prompt template missing; using fallback prompt",
        {
          error: (error as Error).message,
        },
      );
      ImageObservationService.cachedPrompt = DEFAULT_SYSTEM_PROMPT;
    }

    return ImageObservationService.cachedPrompt;
  }
}
