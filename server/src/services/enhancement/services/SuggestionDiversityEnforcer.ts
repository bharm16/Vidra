import { logger } from "@infrastructure/Logger";
import type { Suggestion, AIService } from "./types.js";

/**
 * SuggestionDiversityEnforcer
 *
 * Responsible for ensuring diversity in enhancement suggestions.
 * Prevents similar suggestions and enforces categorical balance.
 *
 * Single Responsibility: Suggestion diversity and deduplication
 */
export class SuggestionDiversityEnforcer {
  private readonly maxLlmReplacements = 2;

  constructor(private readonly ai: AIService) {}

  /**
   * Ensure diverse suggestions by replacing too-similar ones
   * @param suggestions - Array of suggestion objects
   * @returns Diverse suggestions
   */
  async ensureDiverseSuggestions(
    suggestions: Suggestion[],
  ): Promise<Suggestion[]> {
    if (!suggestions || suggestions.length <= 1) return suggestions;

    // Special handling for categorized suggestions
    if (suggestions[0]?.category) {
      const uniqueCategories = new Set(
        suggestions.map((suggestion) => suggestion.category || "Other"),
      );
      if (uniqueCategories.size > 1) {
        return this.ensureCategoricalDiversity(suggestions);
      }
    }

    // Calculate similarity matrix
    const similarities: Array<{ i: number; j: number; similarity: number }> =
      [];
    for (let i = 0; i < suggestions.length; i++) {
      const first = suggestions[i];
      if (!first) continue;
      for (let j = i + 1; j < suggestions.length; j++) {
        const second = suggestions[j];
        if (!second) continue;
        const sim = await this.calculateSimilarity(first.text, second.text);
        similarities.push({ i, j, similarity: sim });
      }
    }

    // Find too-similar pairs (threshold: 0.7)
    const threshold = 0.7;
    const tooSimilar = similarities.filter((s) => s.similarity > threshold);

    if (tooSimilar.length === 0) {
      return suggestions; // Already diverse
    }

    // Mark indices that need replacement
    const toReplace = new Set<number>();
    tooSimilar.forEach((pair) => {
      // Keep the first, replace the second
      toReplace.add(pair.j);
    });

    // Generate replacements for similar suggestions
    const diverseSuggestions = [...suggestions];
    const replacementIndices = Array.from(toReplace);
    const limitedReplacements = replacementIndices.slice(
      0,
      this.maxLlmReplacements,
    );

    for (const idx of limitedReplacements) {
      diverseSuggestions[idx] = await this.generateDiverseAlternative(
        suggestions,
        idx,
      );
    }

    logger.info("Enforced diversity", {
      original: suggestions.length,
      replaced: limitedReplacements.length,
      skipped: toReplace.size - limitedReplacements.length,
    });

    return diverseSuggestions;
  }

  /**
   * Ensure diversity across categories
   * Prevents any single category from dominating suggestions
   * @param suggestions - Array of categorized suggestions
   * @returns Balanced suggestions
   */
  ensureCategoricalDiversity(suggestions: Suggestion[]): Suggestion[] {
    // Group by category
    const categoryCounts: Record<string, number> = {};
    suggestions.forEach((s) => {
      const cat = s.category || "Other";
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    const uniqueCategories = Object.keys(categoryCounts);
    if (uniqueCategories.length <= 1) {
      logger.debug(
        "Single-category suggestions, skipping categorical rebalancing",
        {
          category: uniqueCategories[0] || "Other",
          suggestions: suggestions.length,
        },
      );
      return suggestions;
    }

    // Check if any category is over-represented (more than 40% of suggestions)
    const totalSuggestions = suggestions.length;
    const maxPerCategory = Math.ceil(totalSuggestions * 0.4);

    let needsRebalancing = false;
    for (const [category, count] of Object.entries(categoryCounts)) {
      if (count > maxPerCategory) {
        logger.info("Category over-represented", {
          category,
          count,
          max: maxPerCategory,
        });
        needsRebalancing = true;
        break;
      }
    }

    if (!needsRebalancing) {
      return suggestions; // Already balanced
    }

    // Rebalance by limiting each category
    const balanced: Suggestion[] = [];
    const categoryLimits: Record<string, number> = {};

    // First pass: take up to max from each category
    suggestions.forEach((suggestion) => {
      const cat = suggestion.category || "Other";
      if (!categoryLimits[cat]) categoryLimits[cat] = 0;

      if (categoryLimits[cat] < maxPerCategory) {
        balanced.push(suggestion);
        categoryLimits[cat]++;
      }
    });

    // Ensure we have enough diversity in categories
    if (uniqueCategories.length < 3 && totalSuggestions >= 6) {
      logger.warn("Not enough category diversity", {
        categories: uniqueCategories.length,
        suggestions: totalSuggestions,
      });
    }

    return balanced;
  }

  /**
   * Stop words excluded from echo comparison (common glue words)
   */
  private static readonly STOP_WORDS = new Set([
    "a",
    "an",
    "the",
    "with",
    "and",
    "of",
    "in",
    "on",
    "for",
    "to",
    "by",
    "at",
    "from",
    "is",
    "are",
    "was",
    "were",
    "be",
    "its",
    "it",
    "or",
  ]);

  /**
   * Filter suggestions that echo the original highlighted text.
   *
   * Prevents "same concept + modifier" suggestions like:
   *   original "medium close" → suggestion "medium close-up with 85mm lens"
   *
   * Uses Jaccard similarity on stop-word-stripped token sets plus
   * core concept containment to detect echoes.
   */
  filterOriginalEchoes(
    suggestions: Suggestion[],
    originalText: string,
  ): Suggestion[] {
    if (!originalText || suggestions.length === 0) return suggestions;

    const originalTokens = SuggestionDiversityEnforcer.tokenize(originalText);
    if (originalTokens.size === 0) return suggestions;

    const coreConcept =
      SuggestionDiversityEnforcer.extractCoreConcept(originalText);
    const isSingleWord = originalText.trim().split(/\s+/).length === 1;

    const filtered = suggestions.filter((suggestion) => {
      const suggestionTokens = SuggestionDiversityEnforcer.tokenize(
        suggestion.text,
      );
      if (suggestionTokens.size === 0) return true;

      const intersection = new Set(
        [...originalTokens].filter((t) => suggestionTokens.has(t)),
      );
      const union = new Set([...originalTokens, ...suggestionTokens]);
      const jaccard = union.size > 0 ? intersection.size / union.size : 0;

      if (isSingleWord) {
        return jaccard <= 0.6;
      }

      // For multi-word originals, use a threshold that catches
      // "same concept + modifier" echoes while allowing genuinely different suggestions
      return !(
        jaccard >= 0.45 &&
        coreConcept !== null &&
        suggestionTokens.has(coreConcept)
      );
    });

    if (filtered.length < suggestions.length) {
      logger.info("Filtered original echoes", {
        original: originalText,
        removed: suggestions.length - filtered.length,
        remaining: filtered.length,
      });
    }

    return filtered;
  }

  /**
   * Tokenize text: lowercase, split on whitespace/hyphens, remove stop words
   */
  private static tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .split(/[\s\-]+/)
        .filter(
          (t) => t.length > 0 && !SuggestionDiversityEnforcer.STOP_WORDS.has(t),
        ),
    );
  }

  /**
   * Extract the core concept — the longest non-stop-word token
   */
  private static extractCoreConcept(text: string): string | null {
    const tokens = [...SuggestionDiversityEnforcer.tokenize(text)];
    if (tokens.length === 0) return null;
    return tokens.reduce(
      (longest, t) => (t.length > longest.length ? t : longest),
      tokens[0]!,
    );
  }

  /**
   * Calculate similarity between two texts using Jaccard similarity
   * @param text1 - First text
   * @param text2 - Second text
   * @returns Similarity score (0-1)
   */
  async calculateSimilarity(text1: string, text2: string): Promise<number> {
    // Simple character-level similarity (Jaccard)
    const set1 = new Set(text1.toLowerCase().split(/\s+/));
    const set2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    if (union.size === 0) return 0;

    // Also check for substring containment
    const substringPenalty =
      text1.includes(text2) || text2.includes(text1) ? 0.3 : 0;

    return intersection.size / union.size + substringPenalty;
  }

  /**
   * Generate a diverse alternative to replace a similar suggestion
   * Uses LLM to create a meaningfully different alternative
   * @param suggestions - All suggestions
   * @param indexToReplace - Index of suggestion to replace
   * @returns New diverse suggestion
   */
  async generateDiverseAlternative(
    suggestions: Suggestion[],
    indexToReplace: number,
  ): Promise<Suggestion> {
    const original = suggestions[indexToReplace];
    if (!original) {
      logger.warn(
        "Suggestion index out of range during diversity replacement",
        {
          indexToReplace,
          suggestionCount: suggestions.length,
        },
      );
      return { text: "", explanation: "Unable to generate alternative" };
    }
    const otherSuggestions = suggestions.filter((_, i) => i !== indexToReplace);

    const diversityPrompt = `Generate a diverse alternative that is meaningfully different from the existing suggestions.

Original suggestion to replace: "${original.text}"

Existing suggestions to differ from:
${otherSuggestions.map((s, i) => `${i + 1}. "${s.text}"`).join("\n")}

Requirements:
1. Must serve the same purpose as the original
2. Must be meaningfully different in approach or style
3. Should explore a different angle or perspective
4. Maintain quality and relevance

Provide a JSON object with the new suggestion:
{"text": "your diverse alternative", "explanation": "why this is different"}`;

    try {
      const response = await this.ai.execute("enhance_diversity", {
        systemPrompt: diversityPrompt,
        maxTokens: 256,
        temperature: 0.9, // Higher temperature for diversity
      });

      const responseText =
        (response as { text?: string; content?: Array<{ text?: string }> })
          .text ||
        (response as { content?: Array<{ text?: string }> }).content?.[0]
          ?.text ||
        "";
      const alternative = JSON.parse(responseText) as Suggestion;
      if (original.category && !alternative.category) {
        alternative.category = original.category;
      }
      return alternative;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.warn("Failed to generate diverse alternative", {
        error: errorMessage,
      });
      // Fallback: return original with slight modification
      return {
        text: `${original.text} (alternative approach)`,
        explanation: original.explanation || "Alternative variation",
      };
    }
  }
}
