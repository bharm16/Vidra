import { describe, it, expect } from "vitest";
import { mapSpansToIR } from "@services/video-prompt-analysis/services/analysis/SpanToIrMapper";
import { createEmptyIR } from "@services/video-prompt-analysis/services/analysis/IrFactory";
import type { VideoPromptIR } from "@services/video-prompt-analysis/types";

function mapSpans(spans: Array<Record<string, unknown>>): VideoPromptIR {
  const ir = createEmptyIR("test");
  mapSpansToIR(spans, ir);
  return ir;
}

describe("SpanToIrMapper - mapSpansToIR", () => {
  // ===========================================================================
  // ERROR HANDLING & INVALID INPUT (~50%)
  // ===========================================================================
  describe("error handling and invalid input", () => {
    it("does not add duplicate subjects", () => {
      const ir = mapSpans([
        { category: "subject.main", text: "woman" },
        { category: "subject.detail", text: "Woman" },
      ]);
      expect(ir.subjects.length).toBe(1);
    });

    it("does not add duplicate actions", () => {
      const ir = mapSpans([
        { category: "action.primary", text: "Running" },
        { category: "action.secondary", text: "running" },
      ]);
      expect(ir.actions.length).toBe(1);
    });

    it("does not add duplicate camera movements", () => {
      const ir = mapSpans([
        { category: "camera.movement", text: "Dolly in" },
        { category: "camera.movement", text: "dolly in" },
      ]);
      expect(ir.camera.movements.length).toBe(1);
    });

    it("does not add duplicate lighting entries", () => {
      const ir = mapSpans([
        { category: "lighting.source", text: "golden hour" },
        { category: "lighting.quality", text: "Golden Hour" },
      ]);
      expect(ir.environment.lighting.length).toBe(1);
    });

    it("does not add duplicate styles", () => {
      const ir = mapSpans([
        { category: "style.genre", text: "Noir" },
        { category: "style.aesthetic", text: "noir" },
      ]);
      expect(ir.meta.style.length).toBe(1);
    });
  });

  // ===========================================================================
  // EDGE CASES (~30%)
  // ===========================================================================
  describe("edge cases", () => {
    it("trims whitespace from span text", () => {
      const ir = mapSpans([{ category: "subject.main", text: "  a woman  " }]);
      expect(ir.subjects[0]?.text).toBe("a woman");
    });

    it("handles unknown category prefixes gracefully (no crash, no mapping)", () => {
      const ir = mapSpans([
        { category: "unknown.category", text: "some text" },
      ]);
      expect(ir.subjects).toEqual([]);
      expect(ir.actions).toEqual([]);
      expect(ir.camera.movements).toEqual([]);
    });

    it("camera.angle overwrites with latest span", () => {
      const ir = mapSpans([
        { category: "camera.angle", text: "low angle" },
        { category: "camera.angle", text: "high angle" },
      ]);
      expect(ir.camera.angle).toBe("high angle");
    });

    it("shot.type overwrites with latest span", () => {
      const ir = mapSpans([
        { category: "shot.type", text: "wide shot" },
        { category: "shot.type", text: "close-up" },
      ]);
      expect(ir.camera.shotType).toBe("close-up");
    });

    it("environment.weather overwrites with latest span", () => {
      const ir = mapSpans([
        { category: "environment.weather", text: "rainy" },
        { category: "environment.weather", text: "foggy" },
      ]);
      expect(ir.environment.weather).toBe("foggy");
    });
  });

  // ===========================================================================
  // CORE BEHAVIOR - CATEGORY MAPPING (~20%)
  // ===========================================================================
  describe("category mapping", () => {
    it("maps environment.location spans to ir.environment.setting (original case)", () => {
      const ir = mapSpans([
        { category: "environment.location", text: "Tokyo Streets" },
      ]);
      expect(ir.environment.setting).toBe("Tokyo Streets");
    });

    it("maps audio.score spans to ir.audio.music (original case)", () => {
      const ir = mapSpans([{ category: "audio.score", text: "Orchestral" }]);
      expect(ir.audio.music).toBe("Orchestral");
    });

    it("maps audio.soundEffect spans to ir.audio.sfx (original case)", () => {
      const ir = mapSpans([
        { category: "audio.soundEffect", text: "Rain drops" },
      ]);
      expect(ir.audio.sfx).toBe("Rain drops");
    });
  });
});
