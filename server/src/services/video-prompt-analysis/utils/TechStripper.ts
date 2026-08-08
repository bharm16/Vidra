/**
 * TechStripper Utility
 *
 * Removes tokens that degrade model performance in two tiers:
 * 1. Universal: camera spec tokens (f-stop, ISO) stripped for ALL models
 * 2. Model-aware: placebo quality tokens stripped for Runway/Luma/Wan, kept for Kling/Veo/Sora
 *
 * @module TechStripper
 */

import { escapeRegex } from "@shared/utils/escapeRegex";
import {
  resolveCanonicalPromptModelId,
  type CanonicalPromptModelId,
} from "@shared/videoModels";

/**
 * Placebo tokens that may degrade performance on certain models
 */
const PLACEBO_TOKENS = [
  "4k",
  "8k",
  "trending on artstation",
  "award winning",
  "award-winning",
  "highly detailed",
  "ultra hd",
  "ultra-hd",
  "uhd",
  "hdr",
  "masterpiece",
  "best quality",
] as const;

/**
 * Camera specification patterns universally ignored by ALL video generation models.
 * No diffusion or transformer video model uses aperture, ISO, or sensor-size values.
 * Each entry creates a fresh RegExp per call to avoid global-regex lastIndex issues.
 */
const CAMERA_SPEC_PATTERNS: readonly {
  label: string;
  source: string;
  flags: string;
}[] = [
  // f-stop values: f/1.8, f/2.8, (f/1.8-f/2.8), f / 2.8
  {
    label: "f-stop",
    source:
      "\\(?\\s*f\\s*\\/\\s*\\d+(?:\\.\\d+)?(?:\\s*[-\\u2013]\\s*f\\s*\\/\\s*\\d+(?:\\.\\d+)?)?\\s*\\)?",
    flags: "gi",
  },
  // ISO values: ISO 800, ISO3200
  { label: "ISO", source: "\\bISO\\s*\\d+", flags: "gi" },
];

type PlaceboTokenPolicy = "strip" | "keep";

/**
 * Per-model placebo token policy.
 *
 * `strip` — the model performs better without resolution/quality boosters.
 * `keep`  — the model may benefit from quality descriptors.
 *
 * Keyed by `CanonicalPromptModelId`, so a pre-migration id (`kling-26`,
 * `veo-4`) is a compile error here rather than a silent miss that flips the
 * policy to the default. Adding a canonical model without a policy is also a
 * compile error.
 */
const PLACEBO_TOKEN_POLICY: Record<CanonicalPromptModelId, PlaceboTokenPolicy> =
  {
    "runway-gen45": "strip",
    "luma-ray3": "strip",
    "wan-2.2": "strip",
    "kling-2.1": "keep",
    "veo-3": "keep",
    "sora-2": "keep",
  };

/** Safer default: models with no registered policy get their tokens stripped. */
const DEFAULT_PLACEBO_TOKEN_POLICY: PlaceboTokenPolicy = "strip";

/**
 * Result of TechStripper processing
 */
export interface TechStripperResult {
  /** The processed text with tokens removed or preserved */
  text: string;
  /** List of tokens that were stripped */
  strippedTokens: string[];
  /** Whether tokens were stripped (true) or preserved (false) */
  tokensWereStripped: boolean;
}

/**
 * TechStripper removes tokens that degrade model performance
 *
 * Two-tier stripping:
 * - Universal: camera specs (f-stop, ISO) are always stripped — no video model uses them
 * - Model-aware: placebo quality tokens (4k, masterpiece) follow `PLACEBO_TOKEN_POLICY`
 */
export class TechStripper {
  /**
   * Process text to strip technical and placebo tokens
   *
   * @param text - Input text to process
   * @param modelId - Target model identifier; canonical ids and their aliases
   *   (see `PROMPT_MODEL_ALIASES`) both resolve
   * @returns Processed result with text and metadata
   */
  strip(text: string, modelId: string): TechStripperResult {
    const strippedTokens: string[] = [];
    let processedText = text;

    // Tier 1: Universal — strip camera specs (all video models ignore these)
    for (const { label, source, flags } of CAMERA_SPEC_PATTERNS) {
      const pattern = new RegExp(source, flags);
      const before = processedText;
      processedText = processedText.replace(
        pattern,
        // No capture groups in CAMERA_SPEC_PATTERNS, so the replacer receives
        // (match, offset, whole) — keep it that way if a pattern is added.
        (match: string, offset: number, whole: string) => {
          if (this.runsIntoAWord(match, offset, whole)) {
            return match;
          }
          // Replace with a space rather than "". The patterns' leading and
          // trailing \s* sit INSIDE the match (they exist for "( f/2.8 )"), so
          // deleting outright takes the neighbours' separator with it:
          // "portrait f/1.8 award winning" became "portraitaward winning".
          // cleanWhitespace collapses the space this leaves behind.
          return " ";
        },
      );
      if (processedText !== before) {
        strippedTokens.push(label);
      }
    }

    // Tier 2: Model-aware — strip placebo tokens for models that don't benefit
    const shouldStrip = this.shouldStripTokens(modelId);
    if (shouldStrip) {
      for (const token of PLACEBO_TOKENS) {
        const regex = new RegExp(`\\b${escapeRegex(token)}\\b`, "gi");
        const matches = processedText.match(regex);

        if (matches) {
          strippedTokens.push(...matches.map((m) => m.toLowerCase()));
          processedText = processedText.replace(regex, "");
        }
      }
    }

    if (strippedTokens.length === 0) {
      return { text, strippedTokens: [], tokensWereStripped: false };
    }

    // Clean up extra whitespace from removals
    processedText = this.cleanWhitespace(processedText);

    return {
      text: processedText,
      strippedTokens: [...new Set(strippedTokens)], // Deduplicate
      tokensWereStripped: true,
    };
  }

  /**
   * Check if a token is a placebo token
   *
   * @param token - Token to check
   * @returns true if the token is a placebo token
   */
  isPlaceboToken(token: string): boolean {
    const normalized = token.toLowerCase().trim();
    return PLACEBO_TOKENS.some(
      (placebo) => placebo.toLowerCase() === normalized,
    );
  }

  /**
   * Determine if tokens should be stripped for a given model.
   *
   * Alias resolution is delegated to `resolveCanonicalPromptModelId` — the
   * single owner of that mapping — so callers may pass either a canonical id
   * or any registered alias.
   *
   * @param modelId - Model identifier
   * @returns true if tokens should be stripped, false if kept
   */
  shouldStripTokens(modelId: string): boolean {
    const canonicalModelId = resolveCanonicalPromptModelId(modelId);
    const policy = canonicalModelId
      ? PLACEBO_TOKEN_POLICY[canonicalModelId]
      : DEFAULT_PLACEBO_TOKEN_POLICY;
    return policy === "strip";
  }

  /**
   * True when a camera-spec match ends on a digit that the source continues
   * with a letter — meaning the digit belongs to the following word, not to
   * the spec.
   *
   * The f-stop pattern tolerates whitespace after the slash (for the "f / 2.8"
   * form), which also lets it reach across a space into whatever follows. In
   * "f/ 8k" it matched "f/ 8" and stripping left "k": the resolution lost its
   * leading digit. An aperture value never runs straight into letters, so this
   * rejects the match instead of narrowing the pattern.
   *
   * Deliberately no regex: `toLowerCase() !== toUpperCase()` identifies a
   * letter in any alphabet that has case, and the digit test is a range check.
   */
  private runsIntoAWord(match: string, offset: number, whole: string): boolean {
    const lastChar = match[match.length - 1];
    const nextChar = whole[offset + match.length];
    if (lastChar === undefined || nextChar === undefined) {
      return false;
    }
    const endsOnDigit = lastChar >= "0" && lastChar <= "9";
    const nextIsLetter = nextChar.toLowerCase() !== nextChar.toUpperCase();
    return endsOnDigit && nextIsLetter;
  }

  /**
   * Clean up whitespace after token removal
   */
  private cleanWhitespace(text: string): string {
    return text
      .replace(/\s+/g, " ") // Collapse multiple spaces
      .replace(/\s*,\s*,/g, ",") // Fix double commas
      .replace(/,\s*$/g, "") // Remove trailing comma
      .replace(/^\s*,/g, "") // Remove leading comma
      .replace(/\s*,/g, ",") // Fix space before comma
      .replace(/,\s*/g, ", ") // Normalize comma spacing
      .trim();
  }
}

/**
 * Singleton instance for convenience
 */
export const techStripper = new TechStripper();
