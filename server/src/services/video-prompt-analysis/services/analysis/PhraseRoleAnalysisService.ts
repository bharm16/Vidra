import {
  CATEGORY_PATTERNS,
  CONTEXT_PATTERNS,
  DEFAULT_ROLE,
  getRoleForCategoryId,
} from "@services/video-prompt-analysis/config/categoryMapping";
import { normalizeText } from "@services/video-prompt-analysis/utils/textHelpers";
import { logger } from "@infrastructure/Logger";

/**
 * Service responsible for analyzing and detecting phrase roles in video prompts
 */
export class PhraseRoleAnalysisService {
  /**
   * Detect the likely role of a highlighted phrase within a video prompt
   */
  detectVideoPhraseRole(
    highlightedText: string | null | undefined,
    contextBefore: string | null | undefined,
    contextAfter: string | null | undefined,
    explicitCategory: string | null | undefined,
  ): string {
    const text = highlightedText?.trim() || "";
    const normalizedCategory = explicitCategory
      ? normalizeText(explicitCategory)
      : "";

    // Try to map from explicit category first
    if (normalizedCategory) {
      const categoryRole = getRoleForCategoryId(normalizedCategory);
      if (categoryRole) {
        logger.debug("Category mapped from explicit category", {
          input: normalizedCategory,
          output: categoryRole,
        });
        return categoryRole;
      }
    }

    // If no text, return default
    if (!text) {
      return DEFAULT_ROLE;
    }

    // Try to map from combined context
    const combinedContext = normalizeText(
      `${contextBefore || ""} ${contextAfter || ""}`,
    );
    const contextRole = this._mapCategory(combinedContext);
    if (contextRole) {
      return contextRole;
    }

    // Try specific context patterns
    const patternRole = this._matchContextPatterns(combinedContext);
    if (patternRole) {
      return patternRole;
    }

    return DEFAULT_ROLE;
  }

  /**
   * Map a category string to a phrase role
   */
  private _mapCategory(category: string): string | null {
    if (!category) return null;

    // Check each category pattern
    for (const [, config] of Object.entries(CATEGORY_PATTERNS)) {
      if (config.pattern.test(category)) {
        return config.role;
      }
    }

    return null;
  }

  /**
   * Match specific context patterns to determine role
   */
  private _matchContextPatterns(context: string): string | null {
    if (CONTEXT_PATTERNS.location.test(context)) {
      return "location or environment detail";
    }

    if (CONTEXT_PATTERNS.camera.test(context)) {
      return "camera or framing description";
    }

    if (CONTEXT_PATTERNS.lighting.test(context)) {
      return "lighting description";
    }

    if (CONTEXT_PATTERNS.character.test(context)) {
      return "subject or character detail";
    }

    if (CONTEXT_PATTERNS.style.test(context)) {
      return "style or tone descriptor";
    }

    if (CONTEXT_PATTERNS.audio.test(context)) {
      return "audio or score descriptor";
    }

    return null;
  }
}
