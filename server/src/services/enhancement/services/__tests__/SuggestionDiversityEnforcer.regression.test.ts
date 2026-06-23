import { describe, expect, it } from "vitest";
import { SuggestionDiversityEnforcer } from "../SuggestionDiversityEnforcer";
import type { AIService } from "../types";

function createService(): SuggestionDiversityEnforcer {
  return new SuggestionDiversityEnforcer({} as AIService);
}

describe("SuggestionDiversityEnforcer original echo detection regression", () => {
  it("filters a suggestion that echoes the original with added modifiers (3+ token original)", () => {
    const service = createService();

    // original "medium close-up" tokenizes to {medium, close, up} (3 tokens)
    // suggestion "medium close-up with rack focus shift" tokenizes to {medium, close, up, rack, focus, shift}
    // Jaccard = 3/6 = 0.5 >= 0.45, core concept "medium" present → filtered
    const result = service.filterOriginalEchoes(
      [
        { text: "medium close-up with rack focus shift" },
        { text: "bird's-eye view with deep focus" },
      ],
      "medium close-up",
    );

    expect(result.map((s) => s.text)).toEqual([
      "bird's-eye view with deep focus",
    ]);
  });

  it("keeps suggestions that share no core concept with the original", () => {
    const service = createService();

    const result = service.filterOriginalEchoes(
      [
        { text: "low-angle handheld tracking shot" },
        { text: "bird's-eye view with deep focus" },
      ],
      "medium close",
    );

    expect(result.length).toBe(2);
  });

  it("keeps suggestions for single-word originals when Jaccard is low", () => {
    const service = createService();

    // "cinematic" vs "cinematic golden-hour tone"
    // Jaccard = 1/4 = 0.25 ≤ 0.6 → survives
    const result = service.filterOriginalEchoes(
      [
        { text: "cinematic golden-hour tone" },
        { text: "documentary verité style" },
      ],
      "Cinematic",
    );

    expect(result.length).toBe(2);
  });

  it("filters single-word echo when suggestion is near-identical", () => {
    const service = createService();

    // "warm" vs "warm" → Jaccard = 1.0, exceeds 0.6 threshold
    const result = service.filterOriginalEchoes(
      [{ text: "warm" }, { text: "cool blue twilight glow" }],
      "warm",
    );

    expect(result.map((s) => s.text)).toEqual(["cool blue twilight glow"]);
  });

  it("returns all suggestions when original is empty", () => {
    const service = createService();

    const suggestions = [
      { text: "soft focus with motion blur" },
      { text: "sharp high-contrast detail" },
    ];

    expect(service.filterOriginalEchoes(suggestions, "")).toEqual(suggestions);
  });

  it("keeps 2-word original suggestions with low Jaccard overlap", () => {
    const service = createService();

    // "eye level" tokenizes to {eye, level} (2 tokens)
    // "eye-level dolly in with 50mm lens" tokenizes to {eye, level, dolly, 50mm, lens}
    // Jaccard = 2/5 = 0.4 < 0.45 → survives
    const result = service.filterOriginalEchoes(
      [
        { text: "eye-level dolly in with 50mm lens" },
        { text: "low-angle handheld close-up" },
        { text: "overhead wide shot with shallow depth" },
      ],
      "eye level",
    );

    expect(result.length).toBe(3);
  });

  it("filters multi-word echo with high token overlap", () => {
    const service = createService();

    // original "shallow depth of field" tokenizes to {shallow, depth, field} (3 tokens, "of" is stop word)
    // suggestion "shallow depth of field with soft bokeh" tokenizes to {shallow, depth, field, soft, bokeh}
    // Jaccard = 3/5 = 0.6 >= 0.45, core concept "shallow" present → filtered
    const result = service.filterOriginalEchoes(
      [
        { text: "shallow depth of field with soft bokeh" },
        { text: "deep focus across the entire frame" },
      ],
      "shallow depth of field",
    );

    expect(result.map((s) => s.text)).toEqual([
      "deep focus across the entire frame",
    ]);
  });
});
