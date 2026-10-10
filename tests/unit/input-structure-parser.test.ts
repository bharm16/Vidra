import { describe, it, expect } from "vitest";
import { parseInputStructure } from "@services/video-prompt-analysis/services/analysis/InputStructureParser";

describe("InputStructureParser - parseInputStructure", () => {
  // ===========================================================================
  // ERROR HANDLING & INVALID INPUT (~50%)
  // ===========================================================================
  describe("error handling and invalid input", () => {
    it("returns the entire text as narrative when no sections detected", () => {
      const result = parseInputStructure("A beautiful sunset over the ocean");
      expect(result.narrative).toBe("A beautiful sunset over the ocean");
      expect(result.technical).toBeUndefined();
      expect(result.alternatives).toBeUndefined();
    });

    it("handles JSON object with only non-string values in technical", () => {
      const input = JSON.stringify({
        narrative: "A scene",
        technical: { duration: 42, fps: true },
      });
      const result = parseInputStructure(input);
      expect(result.narrative).toBe("A scene");
      // Non-string values should be filtered out
      expect(result.technical).toBeUndefined();
    });

    it("handles JSON object where technical has empty string values", () => {
      const input = JSON.stringify({
        narrative: "A scene",
        technical: { duration: "  ", fps: "" },
      });
      const result = parseInputStructure(input);
      expect(result.narrative).toBe("A scene");
      expect(result.technical).toBeUndefined();
    });
  });

  // ===========================================================================
  // EDGE CASES (~30%)
  // ===========================================================================
  describe("edge cases", () => {
    it("parses JSON with description field as fallback for narrative", () => {
      const input = JSON.stringify({
        description: "A woman runs along the beach",
      });
      const result = parseInputStructure(input);
      expect(result.narrative).toBe("A woman runs along the beach");
    });

    it("prefers narrative over description in JSON", () => {
      const input = JSON.stringify({
        narrative: "primary text",
        description: "secondary text",
      });
      const result = parseInputStructure(input);
      expect(result.narrative).toBe("primary text");
    });

    it("parses JSON technical specs", () => {
      const input = JSON.stringify({
        narrative: "A scene",
        technical: { duration: "5s", aspect_ratio: "16:9" },
      });
      const result = parseInputStructure(input);
      expect(result.narrative).toBe("A scene");
      expect(result.technical).toEqual({
        duration: "5s",
        aspect_ratio: "16:9",
      });
    });

    it("parses JSON alternatives array", () => {
      const input = JSON.stringify({
        narrative: "A scene",
        alternatives: ["alt1", "alt2"],
      });
      const result = parseInputStructure(input);
      expect(result.alternatives).toEqual(["alt1", "alt2"]);
    });

    it("text that does not start with { is parsed as plain text", () => {
      const result = parseInputStructure('Some text {"not": "json"}');
      expect(result.narrative).toContain("Some text");
    });
  });

  // ===========================================================================
  // SECTION HEADER PARSING (~20%)
  // ===========================================================================
  describe("section header detection", () => {
    it("parses technical spec bullet points into key-value pairs", () => {
      const input = `Scene description here.

**Technical Specs**
- Duration: 5s
- Frame Rate: 24fps
- Aspect Ratio: 16:9`;
      const result = parseInputStructure(input);
      expect(result.technical?.["duration"]).toBe("5s");
      expect(result.technical?.["frame rate"]).toBe("24fps");
      expect(result.technical?.["aspect ratio"]).toBe("16:9");
    });

    it("handles ## style headers for technical specs", () => {
      const input = `Scene description.

## Technical Details
- Duration: 10s`;
      const result = parseInputStructure(input);
      expect(result.narrative).toBe("Scene description.");
      expect(result.technical?.["duration"]).toBe("10s");
    });

    it("handles colon-style headers", () => {
      const input = `Scene description.

Technical Specs:
- Duration: 5s`;
      const result = parseInputStructure(input);
      expect(result.narrative).toBe("Scene description.");
      expect(result.technical?.["duration"]).toBe("5s");
    });

    it("strips leading bold markers from technical spec values", () => {
      const input = `Narrative here.

**Technical Specs**
- **Duration**: **5s`;
      const result = parseInputStructure(input);
      // parseTechnicalSpecs strips leading ** from value but not trailing
      expect(result.technical?.["duration"]).toBe("5s");
    });

    it("handles asterisk bullet points in technical specs", () => {
      const input = `Narrative text.

**Technical Specs**
* Duration: 5s
* Frame Rate: 30fps`;
      const result = parseInputStructure(input);
      expect(result.technical?.["duration"]).toBe("5s");
      expect(result.technical?.["frame rate"]).toBe("30fps");
    });

    it("alternative approaches header truncates narrative", () => {
      const input = `Main scene description.

**Alternative Approaches**
- Option A: different camera angle`;
      const result = parseInputStructure(input);
      expect(result.narrative).toBe("Main scene description.");
    });

    it("handles text with both technical and alternative headers", () => {
      const input = `Scene narrative.

**Technical Specs**
- Duration: 5s

**Alternative Approaches**
- Variation with different lighting`;
      const result = parseInputStructure(input);
      expect(result.narrative).toBe("Scene narrative.");
      expect(result.technical?.["duration"]).toBe("5s");
    });
  });
});
