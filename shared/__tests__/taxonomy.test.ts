import { describe, it, expect } from "vitest";
import {
  TAXONOMY,
  isValidCategory,
  normalizeRole,
  parseCategoryId,
  getParentCategory,
  isAttribute,
  getAttributesForParent,
} from "../taxonomy";

describe("isValidCategory", () => {
  describe("error handling and edge cases", () => {
    it("returns false for random string", () => {
      expect(isValidCategory("nonexistent.category")).toBe(false);
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
  });
});

describe("getParentCategory", () => {
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

describe("getAttributesForParent", () => {
  describe("error handling and edge cases", () => {
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
  });
});
