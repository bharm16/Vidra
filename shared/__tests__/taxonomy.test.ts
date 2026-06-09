import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  TAXONOMY,
  VALID_CATEGORIES,
  TAXONOMY_VERSION,
  isValidCategory,
  resolveCategory,
  normalizeRole,
  parseCategoryId,
  getParentCategory,
  isAttribute,
  getAllAttributes,
  getAllParentCategories,
  getCategoryById,
  getAttributesForParent,
  getGroupForCategory,
  getColorForCategory,
} from "../taxonomy";

describe("VALID_CATEGORIES population", () => {
  it("contains all parent category IDs", () => {
    for (const category of Object.values(TAXONOMY)) {
      expect(VALID_CATEGORIES.has(category.id)).toBe(true);
    }
  });

  it("contains all attribute IDs", () => {
    for (const category of Object.values(TAXONOMY)) {
      if (category.attributes) {
        for (const attrId of Object.values(category.attributes)) {
          expect(VALID_CATEGORIES.has(attrId)).toBe(true);
        }
      }
    }
  });

  it("has correct size matching unique parents + attributes", () => {
    const uniqueIds = new Set<string>();
    for (const category of Object.values(TAXONOMY)) {
      uniqueIds.add(category.id);
      if (category.attributes) {
        for (const attrId of Object.values(category.attributes)) {
          uniqueIds.add(attrId);
        }
      }
    }
    expect(VALID_CATEGORIES.size).toBe(uniqueIds.size);
  });
});

describe("isValidCategory", () => {
  describe("error handling and edge cases", () => {
    it("returns false for empty string", () => {
      expect(isValidCategory("")).toBe(false);
    });

    it("returns false for random string", () => {
      expect(isValidCategory("nonexistent.category")).toBe(false);
    });

    it("returns false for partial match", () => {
      expect(isValidCategory("subj")).toBe(false);
    });
  });

  describe("core behavior", () => {
    it("validates parent categories", () => {
      expect(isValidCategory("subject")).toBe(true);
      expect(isValidCategory("lighting")).toBe(true);
      expect(isValidCategory("camera")).toBe(true);
    });

    it("validates attribute categories", () => {
      expect(isValidCategory("subject.wardrobe")).toBe(true);
      expect(isValidCategory("lighting.source")).toBe(true);
      expect(isValidCategory("camera.movement")).toBe(true);
    });
  });
});

describe("resolveCategory", () => {
  describe("error handling and edge cases", () => {
    it("returns empty string for null", () => {
      expect(resolveCategory(null)).toBe("");
    });

    it("returns empty string for undefined", () => {
      expect(resolveCategory(undefined)).toBe("");
    });

    it("returns empty string for empty string", () => {
      expect(resolveCategory("")).toBe("");
    });
  });

  describe("core behavior", () => {
    it("returns the ID unchanged", () => {
      expect(resolveCategory("subject.wardrobe")).toBe("subject.wardrobe");
      expect(resolveCategory("camera")).toBe("camera");
    });
  });
});

describe("normalizeRole", () => {
  describe("error handling and edge cases", () => {
    it("defaults null/undefined/empty to the subject root", () => {
      expect(normalizeRole(null)).toBe(TAXONOMY.SUBJECT.id);
      expect(normalizeRole(undefined)).toBe(TAXONOMY.SUBJECT.id);
      expect(normalizeRole("")).toBe(TAXONOMY.SUBJECT.id);
    });

    it("defaults unknown roles to the subject root", () => {
      expect(normalizeRole("nonexistent.category")).toBe(TAXONOMY.SUBJECT.id);
      expect(normalizeRole("garbage")).toBe(TAXONOMY.SUBJECT.id);
    });
  });

  describe("core behavior", () => {
    it("passes valid taxonomy ids through unchanged", () => {
      expect(normalizeRole("subject")).toBe("subject");
      expect(normalizeRole("camera.movement")).toBe("camera.movement");
    });

    it("maps legacy capitalized roles to current taxonomy ids", () => {
      expect(normalizeRole("Lighting")).toBe("lighting");
      expect(normalizeRole("Camera")).toBe("camera");
      expect(normalizeRole("Wardrobe")).toBe("subject.wardrobe");
    });
  });
});

describe("parseCategoryId", () => {
  describe("error handling and edge cases", () => {
    it("returns null for null input", () => {
      expect(parseCategoryId(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(parseCategoryId(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseCategoryId("")).toBeNull();
    });

    it("returns null for non-string input", () => {
      // @ts-expect-error testing runtime behavior
      expect(parseCategoryId(123)).toBeNull();
    });

    it("returns null when dot-split produces empty attribute", () => {
      expect(parseCategoryId("subject.")).toBeNull();
    });
  });

  describe("core behavior", () => {
    it("parses parent category correctly", () => {
      expect(parseCategoryId("subject")).toEqual({
        parent: "subject",
        attribute: null,
        isParent: true,
      });
    });

    it("parses attribute category correctly", () => {
      expect(parseCategoryId("subject.wardrobe")).toEqual({
        parent: "subject",
        attribute: "wardrobe",
        isParent: false,
      });
    });

    it("only uses first dot for splitting", () => {
      const result = parseCategoryId("a.b.c");
      expect(result).toEqual({ parent: "a", attribute: "b", isParent: false });
    });
  });

  describe("property-based", () => {
    it("parsed parent is always the first segment", () => {
      const noDotNonEmpty = fc
        .string({ minLength: 1, maxLength: 20 })
        .filter((s) => !s.includes(".") && s.length > 0);
      fc.assert(
        fc.property(noDotNonEmpty, noDotNonEmpty, (parent, attr) => {
          const result = parseCategoryId(`${parent}.${attr}`);
          expect(result?.parent).toBe(parent);
          expect(result?.attribute).toBe(attr);
          expect(result?.isParent).toBe(false);
        }),
      );
    });
  });
});

describe("getParentCategory", () => {
  describe("error handling and edge cases", () => {
    it("returns null for null", () => {
      expect(getParentCategory(null)).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(getParentCategory(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(getParentCategory("")).toBeNull();
    });
  });

  describe("core behavior", () => {
    it("returns parent from attribute ID", () => {
      expect(getParentCategory("subject.wardrobe")).toBe("subject");
      expect(getParentCategory("camera.movement")).toBe("camera");
    });

    it("returns itself for parent ID", () => {
      expect(getParentCategory("subject")).toBe("subject");
    });
  });
});

describe("isAttribute", () => {
  describe("error handling and edge cases", () => {
    it("returns false for null", () => {
      expect(isAttribute(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isAttribute(undefined)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isAttribute("")).toBe(false);
    });
  });

  describe("core behavior", () => {
    it("returns true for attribute IDs", () => {
      expect(isAttribute("subject.wardrobe")).toBe(true);
      expect(isAttribute("lighting.source")).toBe(true);
    });

    it("returns false for parent IDs", () => {
      expect(isAttribute("subject")).toBe(false);
      expect(isAttribute("camera")).toBe(false);
    });
  });
});

describe("getAllAttributes", () => {
  it("returns a non-empty array", () => {
    expect(getAllAttributes().length).toBeGreaterThan(0);
  });

  it("every attribute contains a dot", () => {
    for (const attr of getAllAttributes()) {
      expect(attr).toContain(".");
    }
  });

  it("all returned attributes are in VALID_CATEGORIES", () => {
    for (const attr of getAllAttributes()) {
      expect(VALID_CATEGORIES.has(attr)).toBe(true);
    }
  });
});

describe("getAllParentCategories", () => {
  it("returns all parent IDs from TAXONOMY", () => {
    const expected = Object.values(TAXONOMY).map((c) => c.id);
    expect(getAllParentCategories()).toEqual(expected);
  });

  it("none contain dots", () => {
    for (const p of getAllParentCategories()) {
      expect(p).not.toContain(".");
    }
  });
});

describe("getCategoryById", () => {
  describe("error handling and edge cases", () => {
    it("returns null for null", () => {
      expect(getCategoryById(null)).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(getCategoryById(undefined)).toBeNull();
    });

    it("returns null for unknown parent", () => {
      expect(getCategoryById("nonexistent")).toBeNull();
    });
  });

  describe("core behavior", () => {
    it("returns CategoryConfig for valid parent", () => {
      const result = getCategoryById("subject");
      expect(result).not.toBeNull();
      expect(result).toHaveProperty("id", "subject");
      expect(result).toHaveProperty("label");
      expect(result).toHaveProperty("group", "entity");
    });

    it("returns attribute info for valid attribute", () => {
      const result = getCategoryById("subject.wardrobe");
      expect(result).not.toBeNull();
      expect(result).toHaveProperty("id", "subject.wardrobe");
      expect(result).toHaveProperty("parent", "subject");
      expect(result).toHaveProperty("isAttribute", true);
    });
  });
});

describe("getAttributesForParent", () => {
  describe("error handling and edge cases", () => {
    it("returns empty array for null", () => {
      expect(getAttributesForParent(null)).toEqual([]);
    });

    it("returns empty array for unknown parent", () => {
      expect(getAttributesForParent("nonexistent")).toEqual([]);
    });
  });

  describe("core behavior", () => {
    it("returns attributes for subject", () => {
      const attrs = getAttributesForParent("subject");
      expect(attrs.length).toBeGreaterThan(0);
      expect(attrs).toContain("subject.identity");
      expect(attrs).toContain("subject.wardrobe");
    });

    it("returns attributes for lighting", () => {
      const attrs = getAttributesForParent("lighting");
      expect(attrs).toContain("lighting.source");
      expect(attrs).toContain("lighting.quality");
    });
  });
});

describe("getGroupForCategory", () => {
  describe("error handling and edge cases", () => {
    it("returns null for null", () => {
      expect(getGroupForCategory(null)).toBeNull();
    });

    it("returns null for unknown category", () => {
      expect(getGroupForCategory("nonexistent")).toBeNull();
    });
  });

  describe("core behavior", () => {
    it("returns correct group for parent", () => {
      expect(getGroupForCategory("subject")).toBe("entity");
      expect(getGroupForCategory("lighting")).toBe("setting");
      expect(getGroupForCategory("camera")).toBe("technical");
    });

    it("returns correct group for attribute", () => {
      expect(getGroupForCategory("subject.wardrobe")).toBe("entity");
      expect(getGroupForCategory("lighting.source")).toBe("setting");
    });
  });
});

describe("getColorForCategory", () => {
  describe("error handling and edge cases", () => {
    it("returns null for null", () => {
      expect(getColorForCategory(null)).toBeNull();
    });

    it("returns null for unknown category", () => {
      expect(getColorForCategory("nonexistent")).toBeNull();
    });
  });

  describe("core behavior", () => {
    it("returns correct color for parent", () => {
      expect(getColorForCategory("subject")).toBe("orange");
      expect(getColorForCategory("lighting")).toBe("yellow");
    });

    it("returns parent color for attribute", () => {
      expect(getColorForCategory("subject.wardrobe")).toBe("orange");
      expect(getColorForCategory("lighting.source")).toBe("yellow");
    });
  });
});

describe("TAXONOMY_VERSION", () => {
  it("is a semver-like string", () => {
    expect(TAXONOMY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
