import { describe, it, expect } from "vitest";
import { CategoryGuidanceService } from "@services/video-prompt-analysis/services/guidance/CategoryGuidanceService";
import type {
  GuidanceSpan,
  EditHistoryEntry,
} from "@services/video-prompt-analysis/types";

function createService(): CategoryGuidanceService {
  return new CategoryGuidanceService();
}

describe("CategoryGuidanceService", () => {
  // ===========================================================================
  // ERROR HANDLING & INVALID INPUT (~50%)
  // ===========================================================================
  describe("error handling - getCategoryFocusGuidance", () => {
    it("returns null when no guidance key matches role or hint", () => {
      const service = createService();
      const result = service.getCategoryFocusGuidance(
        "completely unknown role xyz",
        "unknown hint abc",
      );
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // CONTEXT-AWARE GUIDANCE (~20%)
  // ===========================================================================
  describe("context-aware guidance", () => {
    it("provides lighting gap-filling guidance when no lighting spans exist", () => {
      const service = createService();
      const result = service.getCategoryFocusGuidance(
        "lighting description",
        "lighting",
        "A man walks through a dark forest at night",
        [],
        [],
      );
      expect(result).not.toBeNull();
      expect(
        result!.some((g) => g.includes("direction") || g.includes("DIRECTION")),
      ).toBe(true);
    });

    it("provides camera gap-filling guidance when no camera spans exist", () => {
      const service = createService();
      const result = service.getCategoryFocusGuidance(
        "camera description",
        "camera",
        "A woman runs along the beach at golden hour",
        [],
        [],
      );
      expect(result).not.toBeNull();
      expect(
        result!.some((g) => g.includes("CAMERA") || g.includes("camera")),
      ).toBe(true);
    });

    it("provides subject gap-filling guidance", () => {
      const service = createService();
      const result = service.getCategoryFocusGuidance(
        "subject detail",
        "subject",
        "Someone walks through the city",
        [],
        [],
      );
      expect(result).not.toBeNull();
      expect(
        result!.some((g) => g.includes("PHYSICAL") || g.includes("appearance")),
      ).toBe(true);
    });

    it("provides location guidance", () => {
      const service = createService();
      const result = service.getCategoryFocusGuidance(
        "location detail",
        "location",
        "A scene takes place somewhere interesting",
        [],
        [],
      );
      expect(result).not.toBeNull();
      expect(
        result!.some(
          (g) => g.includes("SPECIFIC") || g.includes("ENVIRONMENTAL"),
        ),
      ).toBe(true);
    });

    it("provides mood guidance", () => {
      const service = createService();
      const result = service.getCategoryFocusGuidance(
        "mood atmosphere",
        "mood",
        "The scene has an unsettling quality",
        [],
        [],
      );
      expect(result).not.toBeNull();
      expect(
        result!.some((g) => g.includes("Mood") || g.includes("SENSORY")),
      ).toBe(true);
    });

    it("provides action guidance", () => {
      const service = createService();
      const result = service.getCategoryFocusGuidance(
        "action movement",
        "action",
        "The character moves through the space",
        [],
        [],
      );
      expect(result).not.toBeNull();
      expect(
        result!.some((g) => g.includes("VERB") || g.includes("MANNER")),
      ).toBe(true);
    });
  });

  describe("relationship analysis", () => {
    it("golden hour time of day creates lighting opportunities", () => {
      const service = createService();
      const elements = service.analyzeExistingElements(
        "golden hour sunset",
        [],
      );
      const relationships = service.analyzeRelationships("lighting", elements);
      expect(relationships.opportunities.length).toBeGreaterThan(0);
      expect(
        relationships.opportunities.some(
          (o) => o.includes("warm") || o.includes("rim"),
        ),
      ).toBe(true);
    });

    it("underwater location creates lighting and camera constraints", () => {
      const service = createService();
      const elements = service.analyzeExistingElements(
        "deep underwater scene",
        [],
      );

      const lightRel = service.analyzeRelationships("lighting", elements);
      expect(
        lightRel.opportunities.some(
          (o) => o.includes("caustic") || o.includes("Caustic"),
        ),
      ).toBe(true);

      const camRel = service.analyzeRelationships("camera", elements);
      expect(
        camRel.opportunities.some(
          (o) => o.includes("fluid") || o.includes("Slow"),
        ),
      ).toBe(true);
    });

    it("desert location creates lighting constraints", () => {
      const service = createService();
      const elements = service.analyzeExistingElements(
        "vast desert landscape",
        [],
      );
      const relationships = service.analyzeRelationships("lighting", elements);
      expect(
        relationships.opportunities.some(
          (o) => o.includes("harsh") || o.includes("Harsh"),
        ),
      ).toBe(true);
    });

    it("moody atmosphere creates lighting constraints", () => {
      const service = createService();
      const elements = service.analyzeExistingElements(
        "a dark moody scene",
        [],
      );
      const relationships = service.analyzeRelationships("lighting", elements);
      expect(
        relationships.opportunities.some(
          (o) => o.includes("low key") || o.includes("Low key"),
        ),
      ).toBe(true);
    });
  });

  describe("gap identification", () => {
    it("does not report gaps when lighting spans cover direction", () => {
      const service = createService();
      const spans: GuidanceSpan[] = [
        { category: "lighting", text: "side light from left" },
      ];
      const elements = service.analyzeExistingElements("", spans);
      const gaps = service.identifyGaps("lighting", elements);
      expect(gaps).not.toContain("direction");
    });
  });

  describe("edit history awareness", () => {
    it("respects moody lighting edit history", () => {
      const service = createService();
      const editHistory: EditHistoryEntry[] = [
        {
          category: "lighting",
          original: "bright sun",
          replacement: "moody shadows",
        },
      ];
      const result = service.getCategoryFocusGuidance(
        "lighting description",
        "lighting",
        "A scene in a dark room",
        [],
        editHistory,
      );
      expect(result).not.toBeNull();
      expect(
        result!.some((g) => g.includes("MOODY") || g.includes("moody")),
      ).toBe(true);
    });

    it("respects soft lighting edit history", () => {
      const service = createService();
      const editHistory: EditHistoryEntry[] = [
        {
          category: "lighting",
          original: "harsh light",
          replacement: "soft diffused",
        },
      ];
      const result = service.getCategoryFocusGuidance(
        "lighting description",
        "lighting",
        "A gentle scene",
        [],
        editHistory,
      );
      expect(result).not.toBeNull();
      expect(
        result!.some((g) => g.includes("SOFT") || g.includes("soft")),
      ).toBe(true);
    });

    it("respects mood evolution in edit history", () => {
      const service = createService();
      const editHistory: EditHistoryEntry[] = [
        { category: "mood", original: "cheerful", replacement: "melancholic" },
      ];
      const result = service.getCategoryFocusGuidance(
        "mood atmosphere",
        "mood",
        "A scene with mixed feelings",
        [],
        editHistory,
      );
      expect(result).not.toBeNull();
      expect(
        result!.some(
          (g) => g.includes("cheerful") && g.includes("melancholic"),
        ),
      ).toBe(true);
    });
  });

  describe("element extraction", () => {
    it("extracts subject from spans", () => {
      const service = createService();
      const spans: GuidanceSpan[] = [
        { category: "subject", text: "elderly woman" },
      ];
      const elements = service.analyzeExistingElements("", spans);
      expect(elements.subject.core).toContain("elderly woman");
      expect(elements.subject.appearance).toBe(true);
    });

    it("extracts camera info from spans", () => {
      const service = createService();
      const spans: GuidanceSpan[] = [
        { category: "camera", text: "dolly in with 50mm lens" },
      ];
      const elements = service.analyzeExistingElements("", spans);
      expect(elements.camera.movement).toBe(true);
      expect(elements.camera.lens).toBe(true);
    });
  });
});
