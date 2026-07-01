import { describe, expect, it } from "vitest";

import { LEGACY_ROLE_TO_CATEGORY, VALID_CATEGORIES } from "@shared/taxonomy";
import { toPublicSpan, toPublicLabelSpansResult } from "../transform";

/**
 * Public span category contract (CONTEXT.md): the `category` on a public
 * span is normalized once, server-side — always a valid taxonomy id, never
 * a raw role and never the invalid "unknown". Clients trust it rather than
 * re-deriving, so this guarantee must hold at its source.
 */
describe("toPublicSpan — Public span category contract", () => {
  const base = { text: "golden hour light", start: 0, end: 17 };

  it("maps every legacy role to a valid taxonomy id", () => {
    for (const [legacyRole, expected] of Object.entries(
      LEGACY_ROLE_TO_CATEGORY,
    )) {
      const pub = toPublicSpan({ ...base, role: legacyRole });
      expect(pub.category).toBe(expected);
      expect(VALID_CATEGORIES.has(pub.category)).toBe(true);
    }
  });

  it("passes through already-valid taxonomy ids unchanged", () => {
    for (const category of VALID_CATEGORIES) {
      const pub = toPublicSpan({ ...base, role: category });
      expect(pub.category).toBe(category);
    }
  });

  it("never emits an invalid category, even for garbage or missing roles", () => {
    const hostileRoles = [
      "unknown",
      "garbage",
      "Subject.Identity",
      "",
      undefined,
    ];
    for (const role of hostileRoles) {
      const pub = toPublicSpan({ ...base, role: role as string });
      expect(VALID_CATEGORIES.has(pub.category)).toBe(true);
      expect(pub.category).not.toBe("unknown");
    }
  });

  it("normalizes spans that arrive with a category field instead of a role", () => {
    const pub = toPublicSpan({ ...base, category: "Lighting" } as never);
    expect(VALID_CATEGORIES.has(pub.category)).toBe(true);
  });

  it("toPublicLabelSpansResult maps every span and tolerates missing arrays", () => {
    const result = toPublicLabelSpansResult({
      spans: [{ ...base, role: "cameraMove" }],
      meta: {},
    } as never);
    expect(result.spans).toHaveLength(1);
    expect(VALID_CATEGORIES.has(result.spans[0]!.category)).toBe(true);

    const empty = toPublicLabelSpansResult({ spans: null, meta: {} } as never);
    expect(empty.spans).toEqual([]);
  });
});
