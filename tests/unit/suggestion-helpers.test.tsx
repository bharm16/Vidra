/**
 * Unit tests for SuggestionsPanel helper utilities
 */

import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import {
  computeKeyboardHint,
  getCompatibilityStyles,
  getLoadingSkeletonCount,
  normalizeSuggestion,
  renderCompatibilityBadge,
} from "@components/SuggestionsPanel/utils/suggestionHelpers";
import {
  COMPATIBILITY_THRESHOLDS,
  MAX_KEYBOARD_SHORTCUTS,
} from "@components/SuggestionsPanel/config/panelConfig";
import type { SuggestionItem } from "@components/SuggestionsPanel/hooks/types";

describe("suggestionHelpers", () => {
  describe("getCompatibilityStyles", () => {
    it("returns null when compatibility is not a number", () => {
      expect(getCompatibilityStyles(undefined)).toBeNull();
    });

    it("returns high compatibility styles", () => {
      const styles = getCompatibilityStyles(COMPATIBILITY_THRESHOLDS.HIGH);

      expect(styles?.IconComponent).toBeTruthy();
      expect(styles?.percent).toBe(
        Math.round(COMPATIBILITY_THRESHOLDS.HIGH * 100),
      );
      expect(styles?.variant).toBe("success");
    });

    it("returns low compatibility styles", () => {
      const styles = getCompatibilityStyles(COMPATIBILITY_THRESHOLDS.LOW - 0.1);

      expect(styles?.IconComponent).toBeTruthy();
      expect(styles?.variant).toBe("warning");
    });

    it("returns neutral styles for mid-range compatibility", () => {
      const styles = getCompatibilityStyles(0.7);

      expect(styles?.IconComponent).toBeNull();
      expect(styles?.variant).toBe("neutral");
    });
  });

  describe("renderCompatibilityBadge", () => {
    it("renders badge with percentage and icon when available", () => {
      const badge = renderCompatibilityBadge(COMPATIBILITY_THRESHOLDS.HIGH);
      expect(badge).not.toBeNull();

      if (!badge) {
        throw new Error("Expected badge to render");
      }

      const badgeElement = badge as ReactElement<{ children?: unknown }>;
      const children = badgeElement.props.children;
      expect(Array.isArray(children)).toBe(true);

      const spanChild = (
        children as Array<{ type?: string; props?: { children?: string } }>
      ).find((child) => child?.type === "span");

      const spanText = spanChild?.props?.children;
      const normalizedText = Array.isArray(spanText)
        ? spanText.join("")
        : spanText;

      expect(normalizedText).toBe("80% fit");
    });

    it("returns null when compatibility is missing", () => {
      expect(renderCompatibilityBadge(undefined)).toBeNull();
    });
  });

  describe("computeKeyboardHint", () => {
    it("returns null when there are no active suggestions", () => {
      expect(computeKeyboardHint(false, 5)).toBeNull();
      expect(computeKeyboardHint(true, 0)).toBeNull();
    });

    it("returns hint capped by max shortcuts", () => {
      expect(computeKeyboardHint(true, 3)).toBe(
        "Use number keys 1-3 for quick selection",
      );
      expect(computeKeyboardHint(true, MAX_KEYBOARD_SHORTCUTS + 2)).toBe(
        `Use number keys 1-${MAX_KEYBOARD_SHORTCUTS} for quick selection`,
      );
    });
  });

  describe("getLoadingSkeletonCount", () => {
    it("returns placeholder count when placeholder is true", () => {
      expect(getLoadingSkeletonCount(10, true)).toBe(4);
    });

    it("returns more skeletons for short text", () => {
      expect(getLoadingSkeletonCount(10, false)).toBe(6);
    });

    it("returns fewer skeletons for medium text", () => {
      expect(getLoadingSkeletonCount(50, false)).toBe(5);
    });

    it("returns minimum skeletons for long text", () => {
      expect(getLoadingSkeletonCount(150, false)).toBe(4);
    });
  });

  describe("normalizeSuggestion", () => {
    it("wraps string suggestion in object", () => {
      expect(normalizeSuggestion("Hello")).toEqual({ text: "Hello" });
    });

    it("keeps suggestion item with text intact", () => {
      const suggestion: SuggestionItem = { text: "Hello", category: "tone" };

      expect(normalizeSuggestion(suggestion)).toEqual({
        text: "Hello",
        category: "tone",
      });
    });

    it("returns null for invalid suggestion shapes", () => {
      const invalidSuggestion: SuggestionItem = { category: "tone" };

      expect(normalizeSuggestion(invalidSuggestion)).toBeNull();
    });
  });
});
