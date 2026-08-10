import { describe, expect, it } from "vitest";
import {
  CATEGORY_PATTERNS,
  getRoleForCategoryId,
} from "@services/video-prompt-analysis/config/categoryMapping";
import { PhraseRoleAnalysisService } from "@services/video-prompt-analysis/services/analysis/PhraseRoleAnalysisService";

/**
 * CATEGORY_PATTERNS is a Record keyed by taxonomy id — the key is the
 * authoritative datum. The resolver destructured it away
 * (`for (const [, config] of Object.entries(...))`) and linear-scanned the
 * entries' unanchored patterns instead, returning the first that matched.
 *
 * Attribute ids are namespaced, so every one of them textually contains its
 * parent's name, and parents are declared first: `camera.movement` matched the
 * ACTION pattern and resolved to "subject movement or activity" long before
 * reaching its own entry. 21 of the 34 declared ids could not reach their own
 * role, and three crossed into a foreign category.
 *
 * The resolved role becomes the slotDescriptor in the enhancement constraint
 * prompt, so clicking a camera span asked the model for subject movement.
 *
 * The domain is finite and enumerable, so this asserts over the whole of it
 * rather than sampling — every declared id, every time.
 */

const DECLARED = Object.entries(CATEGORY_PATTERNS) as [
  string,
  { pattern: RegExp; role: string },
][];

describe("regression: explicit category ids resolve by taxonomy key", () => {
  const service = new PhraseRoleAnalysisService();

  it("declares enough ids to make the sweep meaningful", () => {
    expect(DECLARED.length).toBeGreaterThan(30);
  });

  it.each(DECLARED)(
    "resolves %s to its own declared role",
    (categoryId, config) => {
      expect(
        service.detectVideoPhraseRole("a phrase", null, null, categoryId),
      ).toBe(config.role);
    },
  );

  it("never resolves an attribute id to a role declared by a different parent", () => {
    const crossed = DECLARED.filter(([categoryId]) => categoryId.includes("."))
      .map(([categoryId]) => {
        const parent = categoryId.slice(0, categoryId.indexOf("."));
        const resolved = getRoleForCategoryId(categoryId);
        const parentRole = getRoleForCategoryId(parent);
        return { categoryId, resolved, parentRole };
      })
      .filter(({ categoryId, resolved }) => {
        const own = DECLARED.find(([id]) => id === categoryId)?.[1].role;
        return resolved !== own;
      });

    expect(crossed).toEqual([]);
  });

  it("resolves camera movement as camera, not as subject movement", () => {
    // The named symptom: the role that reached the enhancement prompt.
    expect(getRoleForCategoryId("camera.movement")).toBe("camera movement");
  });

  it("falls back to the parent's role for an attribute the map does not declare", () => {
    // subject.identity has no entry of its own; subject does.
    expect(getRoleForCategoryId("subject.identity")).toBe(
      getRoleForCategoryId("subject"),
    );
  });

  it("resolves nothing for a string the taxonomy does not declare", () => {
    // The scan used to accept bare synonyms. It no longer does, and that is
    // deliberate: production never sends one — transform.ts routes every span
    // category through normalizeRole first. An unknown string returns null so
    // the caller falls through to context detection, which is the same path an
    // unmatched category has always taken.
    expect(getRoleForCategoryId("wardrobe")).toBeNull();
    expect(
      service.detectVideoPhraseRole("red jacket", null, null, "wardrobe"),
    ).toBe("general visual detail");
  });

  it("still infers a role from surrounding prose when no category is given", () => {
    // The free-text path legitimately scans; only the explicit-id path changed.
    expect(
      service.detectVideoPhraseRole(
        "the alley",
        "wide shot of a dimly lit",
        "at night",
        null,
      ),
    ).not.toBe("general visual detail");
  });
});
