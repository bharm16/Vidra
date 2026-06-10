/**
 * Video-to-Image Prompt Transformer
 *
 * Uses LLM to intelligently convert video prompts into static image descriptions.
 * This handles the infinite variety of temporal language, camera movements, and
 * action descriptions that regex patterns cannot cover.
 */

import type { LLMClient } from "@clients/LLMClient";
import { logger } from "@infrastructure/Logger";

const TRANSFORMATION_SYSTEM_PROMPT = `You convert video prompts into a single still-image prompt optimized for FLUX.1 [schnell].

CRITICAL FACT ABOUT FLUX:
- Word order matters. Put the most important constraints FIRST. FLUX pays more attention to what comes first.

OUTPUT REQUIREMENTS:
- Return ONLY the final transformed prompt text.
- 1-2 sentences, ~30-80 words (avoid long tag lists).
- Natural language, but use direct technical phrasing for camera/composition when relevant.
- No negative prompts.

PRIMARY GOAL:
- Preserve and emphasize shot type + camera angle + POV/framing.

PROMPT STRUCTURE (MUST FOLLOW THIS ORDER):
1) CAMERA/COMPOSITION (FIRST CLAUSE)
2) SUBJECT
3) POSE/ACTION (static moment)
4) ENVIRONMENT (include layers if relevant: foreground -> midground -> background)
5) LIGHTING
6) STYLE / TECHNICAL (only if present or strongly implied)

CONTROLLED CAMERA VOCABULARY (use ONE shot size + ONE angle max):
Shot size: extreme wide shot | wide establishing shot | wide shot | full shot | medium shot | medium close-up | close-up | extreme close-up | macro close-up
Angle/POV: eye-level | low angle (worm's-eye view) | high angle (bird's-eye view) | top-down overhead | Dutch angle | over-the-shoulder | first-person POV

TEMPORAL REMOVAL:
- Remove durations and motion verbs ("slowly", "begins to", "then", "camera pans", "dolly", "zoom").
- Convert camera movement into a static framing result:
  - pan left/right -> wide shot with left/right-weighted composition
  - dolly in / zoom in -> closer shot size (medium close-up / close-up / macro close-up)
  - dolly out / zoom out -> wider shot size (wide shot / establishing shot)
  - tilt up -> low angle (worm's-eye view)
  - tilt down -> high angle (bird's-eye view)

PRESERVATION RULES:
- If the input contains an explicit shot/angle/POV/lens term, you MUST include it in the FIRST clause.
- Do NOT invent camera brands or lens/aperture numbers unless the input explicitly includes them.
`;

const CAMERA_SHOT_PATTERNS = [
  {
    regex: /\bextreme[-\s]+wide[-\s]+shot\b/gi,
    canonical: "extreme wide shot",
    category: "shot",
  },
  {
    regex: /\bwide[-\s]+establishing[-\s]+shot\b/gi,
    canonical: "wide establishing shot",
    category: "shot",
  },
  {
    regex: /\bestablishing[-\s]+shot\b/gi,
    canonical: "wide establishing shot",
    category: "shot",
  },
  { regex: /\bwide[-\s]+shot\b/gi, canonical: "wide shot", category: "shot" },
  { regex: /\bfull[-\s]+shot\b/gi, canonical: "full shot", category: "shot" },
  {
    regex: /\bmedium[-\s]+close[-\s]?up\b/gi,
    canonical: "medium close-up",
    category: "shot",
  },
  {
    regex: /\bmedium[-\s]+shot\b/gi,
    canonical: "medium shot",
    category: "shot",
  },
  {
    regex: /\bextreme[-\s]+close[-\s]?up\b/gi,
    canonical: "extreme close-up",
    category: "shot",
  },
  {
    regex: /\bmacro[-\s]+close[-\s]?up\b/gi,
    canonical: "macro close-up",
    category: "shot",
  },
  {
    regex: /\bmacro[-\s]+shot\b/gi,
    canonical: "macro close-up",
    category: "shot",
  },
  { regex: /\bclose[-\s]?up\b/gi, canonical: "close-up", category: "shot" },
] as const;

const CAMERA_ANGLE_PATTERNS = [
  { regex: /\beye[-\s]?level\b/gi, canonical: "eye-level", category: "angle" },
  {
    regex: /\blow[-\s]+angle\b/gi,
    canonical: "low angle (worm's-eye view)",
    category: "angle",
  },
  {
    regex: /\bworm'?s[-\s]?eye\s+view\b/gi,
    canonical: "low angle (worm's-eye view)",
    category: "angle",
  },
  {
    regex: /\bhigh[-\s]+angle\b/gi,
    canonical: "high angle (bird's-eye view)",
    category: "angle",
  },
  {
    regex: /\bbird'?s[-\s]?eye\s+view\b/gi,
    canonical: "high angle (bird's-eye view)",
    category: "angle",
  },
  {
    regex: /\btop[-\s]+down\b/gi,
    canonical: "top-down overhead",
    category: "angle",
  },
  {
    regex: /\boverhead\s+(view|shot|angle|perspective)\b/gi,
    canonical: "top-down overhead",
    category: "angle",
  },
  {
    regex: /\bdutch[-\s]+angle\b/gi,
    canonical: "Dutch angle",
    category: "angle",
  },
  {
    regex: /\btilted[-\s]+horizon\b/gi,
    canonical: "Dutch angle",
    category: "angle",
  },
  {
    regex: /\bover[-\s]+the[-\s]+shoulder\b/gi,
    canonical: "over-the-shoulder",
    category: "angle",
  },
  {
    regex: /\bfirst[-\s]+person[-\s]+pov\b/gi,
    canonical: "first-person POV",
    category: "angle",
  },
  {
    regex: /\bfirst[-\s]+person\b/gi,
    canonical: "first-person POV",
    category: "angle",
  },
  { regex: /\bpov\b/gi, canonical: "first-person POV", category: "angle" },
] as const;

const CAMERA_LENS_PATTERNS = [
  { regex: /\bf\s*\/\s*\d+(?:\.\d+)?\b/gi, category: "lens" },
  { regex: /\bf\s*\d+(?:\.\d+)?\b/gi, category: "lens" },
  { regex: /\b\d{1,3}\s*mm\s+lens\b/gi, category: "lens" },
  { regex: /\b\d{1,3}\s*mm\b/gi, category: "lens" },
] as const;

type CameraCueCategory = "shot" | "angle" | "lens";

type CameraCueMatch = {
  category: CameraCueCategory;
  canonical: string;
  text: string;
  index: number;
};

type CameraCueExtraction = {
  shotSize?: string;
  angle?: string;
  lensDetails: string[];
  hasAny: boolean;
};

const CAMERA_PATTERNS = [
  ...CAMERA_SHOT_PATTERNS,
  ...CAMERA_ANGLE_PATTERNS,
  ...CAMERA_LENS_PATTERNS,
] as const;

const normalizeLensDetail = (value: string) =>
  value.toLowerCase().replace(/\s+/g, "").replace(/lens/g, "");

const collectCameraCueMatches = (text: string): CameraCueMatch[] => {
  const matches: CameraCueMatch[] = [];
  const occupied: Array<{ start: number; end: number }> = [];

  const hasOverlap = (start: number, end: number) =>
    occupied.some(
      ({ start: occupiedStart, end: occupiedEnd }) =>
        start < occupiedEnd && end > occupiedStart,
    );

  for (const pattern of CAMERA_PATTERNS) {
    const regex = new RegExp(
      pattern.regex.source,
      pattern.regex.flags.includes("g")
        ? pattern.regex.flags
        : `${pattern.regex.flags}g`,
    );

    for (const match of text.matchAll(regex)) {
      if (match.index === undefined) {
        continue;
      }
      const start = match.index;
      const end = start + match[0].length;
      if (hasOverlap(start, end)) {
        continue;
      }

      const rawText = match[0].trim();
      const canonical = "canonical" in pattern ? pattern.canonical : rawText;
      matches.push({
        category: pattern.category,
        canonical,
        text: rawText,
        index: start,
      });
      occupied.push({ start, end });
    }
  }

  return matches.sort((a, b) => a.index - b.index);
};

const extractCameraCues = (text: string): CameraCueExtraction => {
  const matches = collectCameraCueMatches(text);
  const shotMatch = matches.find((match) => match.category === "shot");
  const angleMatch = matches.find((match) => match.category === "angle");
  const lensDetails = new Map<string, string>();

  for (const match of matches) {
    if (match.category !== "lens") {
      continue;
    }
    const key = normalizeLensDetail(match.text);
    if (!lensDetails.has(key)) {
      lensDetails.set(key, match.text);
    }
  }

  const extracted: CameraCueExtraction = {
    lensDetails: Array.from(lensDetails.values()),
    hasAny: matches.length > 0,
  };

  if (shotMatch?.canonical) {
    extracted.shotSize = shotMatch.canonical;
  }
  if (angleMatch?.canonical) {
    extracted.angle = angleMatch.canonical;
  }

  return extracted;
};

const hasRequiredCameraCues = (
  text: string,
  required: CameraCueExtraction,
): boolean => {
  if (!required.hasAny) {
    return true;
  }

  const observed = extractCameraCues(text);
  const shotOk = required.shotSize
    ? observed.shotSize === required.shotSize
    : true;
  const angleOk = required.angle ? observed.angle === required.angle : true;
  const observedLensKeys = new Set(
    observed.lensDetails.map(normalizeLensDetail),
  );
  const requiredLensKeys = required.lensDetails.map(normalizeLensDetail);
  const lensOk = requiredLensKeys.every((lensKey) =>
    observedLensKeys.has(lensKey),
  );

  return shotOk && angleOk && lensOk;
};

const removeMatchedRanges = (
  text: string,
  matches: CameraCueMatch[],
): string => {
  if (!matches.length) {
    return text;
  }

  const sorted = [...matches].sort((a, b) => b.index - a.index);
  let result = text;

  for (const match of sorted) {
    result = `${result.slice(0, match.index)}${result.slice(match.index + match.text.length)}`;
  }

  return result;
};

const normalizePromptSpacing = (text: string): string =>
  text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/([,.;:])(?=[^\s])/g, "$1 ")
    .replace(/^[,.;:\s]+/g, "")
    .trim();

type FrontLoadOptions = {
  allowedLensDetails?: string[];
};

const frontLoadCameraCues = (
  text: string,
  options: FrontLoadOptions = {},
): string => {
  const matches = collectCameraCueMatches(text);
  if (!matches.length) {
    return text;
  }

  const shotMatch = matches.find((match) => match.category === "shot");
  const angleMatch = matches.find((match) => match.category === "angle");
  const lensDetails = new Map<string, string>();
  const allowedLensDetails = options.allowedLensDetails;
  const allowedLensKeys = allowedLensDetails
    ? new Set(allowedLensDetails.map(normalizeLensDetail))
    : null;

  for (const match of matches) {
    if (match.category !== "lens") {
      continue;
    }
    if (
      allowedLensKeys &&
      !allowedLensKeys.has(normalizeLensDetail(match.text))
    ) {
      continue;
    }
    const key = normalizeLensDetail(match.text);
    if (!lensDetails.has(key)) {
      lensDetails.set(key, match.text);
    }
  }

  const cameraClauseParts: string[] = [];
  if (shotMatch) {
    cameraClauseParts.push(shotMatch.canonical);
  }
  if (angleMatch) {
    cameraClauseParts.push(angleMatch.canonical);
  }
  if (lensDetails.size > 0) {
    cameraClauseParts.push(...lensDetails.values());
  }

  if (!cameraClauseParts.length) {
    return text;
  }

  const cleaned = normalizePromptSpacing(removeMatchedRanges(text, matches));
  if (!cleaned) {
    return normalizePromptSpacing(cameraClauseParts.join(", "));
  }

  const prefix = `${cameraClauseParts.join(", ")}, `;
  return normalizePromptSpacing(`${prefix}${cleaned}`);
};

const buildRepairSystemPrompt = (requiredCues: CameraCueExtraction): string => {
  const cueList = [
    requiredCues.shotSize,
    requiredCues.angle,
    ...requiredCues.lensDetails,
  ].filter((cue): cue is string => Boolean(cue));

  if (!cueList.length) {
    return TRANSFORMATION_SYSTEM_PROMPT;
  }

  return `${TRANSFORMATION_SYSTEM_PROMPT}

REPAIR MODE:
- You dropped camera constraints. Rewrite again with the camera clause FIRST.
- Required camera cues: ${cueList.join(", ")}.
`;
};

export interface VideoToImageTransformerOptions {
  llmClient: LLMClient;
  timeoutMs?: number;
}

/**
 * LLM-powered video-to-image prompt transformer
 *
 * Uses Gemini for fast, intelligent transformation that handles
 * any prompt format - not limited to predefined patterns.
 */
export class VideoToImagePromptTransformer {
  private readonly llmClient: LLMClient;
  private readonly timeoutMs: number;
  private readonly log = logger.child({
    service: "VideoToImagePromptTransformer",
  });

  constructor(options: VideoToImageTransformerOptions) {
    this.llmClient = options.llmClient;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  /**
   * Transform a video prompt into a static image description
   *
   * @param videoPrompt - The original video prompt with temporal/movement language
   * @returns Transformed prompt suitable for image generation
   */
  async transform(videoPrompt: string): Promise<string> {
    const trimmed = videoPrompt.trim();

    if (!trimmed) {
      return trimmed;
    }

    const startTime = performance.now();
    const requiredCameraCues = extractCameraCues(trimmed);

    try {
      const response = await this.llmClient.complete(
        TRANSFORMATION_SYSTEM_PROMPT,
        {
          userMessage: trimmed,
          maxTokens: 500,
          temperature: 0.2, // Low temperature for consistent transformations
          timeout: this.timeoutMs,
          jsonMode: false,
          // Gemini 2.5 thinking tokens count against maxTokens; uncapped
          // thinking eats the 500 budget and truncates the prompt mid-phrase.
          thinkingBudget: 0,
        },
      );

      let transformed = frontLoadCameraCues(response.text.trim(), {
        allowedLensDetails: requiredCameraCues.lensDetails,
      });
      let wasRepaired = false;

      if (
        requiredCameraCues.hasAny &&
        !hasRequiredCameraCues(transformed, requiredCameraCues)
      ) {
        this.log.debug("Camera cues missing; attempting repair pass", {
          shotSize: requiredCameraCues.shotSize,
          angle: requiredCameraCues.angle,
          lensDetails: requiredCameraCues.lensDetails,
        });

        try {
          const repairResponse = await this.llmClient.complete(
            buildRepairSystemPrompt(requiredCameraCues),
            {
              userMessage: trimmed,
              maxTokens: 500,
              temperature: 0, // Deterministic repair for missing camera cues
              timeout: this.timeoutMs,
              jsonMode: false,
              thinkingBudget: 0,
            },
          );

          const repaired = frontLoadCameraCues(repairResponse.text.trim(), {
            allowedLensDetails: requiredCameraCues.lensDetails,
          });
          if (repaired) {
            transformed = repaired;
            wasRepaired = true;
          }
        } catch (error) {
          const repairError =
            error instanceof Error ? error.message : String(error);
          this.log.warn("Repair pass failed; keeping initial transformation", {
            error: repairError,
          });
        }
      }

      const duration = Math.round(performance.now() - startTime);

      // Validate we got something back
      if (!transformed || transformed.length < 10) {
        this.log.warn(
          "LLM returned empty or too-short transformation, using original",
          {
            originalLength: trimmed.length,
            transformedLength: transformed.length,
            duration,
          },
        );
        return trimmed;
      }

      this.log.debug("Video prompt transformed for image generation", {
        originalLength: trimmed.length,
        transformedLength: transformed.length,
        duration,
        repaired: wasRepaired,
      });

      return transformed;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const duration = Math.round(performance.now() - startTime);

      this.log.warn(
        "Video-to-image transformation failed, using original prompt",
        {
          error: errorMessage,
          duration,
          promptPreview: trimmed.substring(0, 100),
        },
      );

      // Graceful fallback: return original prompt
      return trimmed;
    }
  }
}
