import { describe, it, expect } from "vitest";
import { StudioModelRegistry } from "../StudioModelRegistry";
import { STUDIO_MODEL_SLUGS } from "../types";

describe("StudioModelRegistry", () => {
  const registry = new StudioModelRegistry();

  describe("roster integrity", () => {
    it("resolves every declared slug", () => {
      for (const slug of STUDIO_MODEL_SLUGS) {
        expect(registry.getModel(slug).slug).toBe(slug);
      }
    });

    it("only names real Replicate owners (recraft-ai, google, openai)", () => {
      for (const entry of registry.listModels()) {
        expect(entry.replicateId).toMatch(/^(recraft-ai|google|openai)\//);
      }
    });

    it("every model has a positive cost estimate", () => {
      for (const entry of registry.listModels()) {
        expect(entry.costCentsPerCall).toBeGreaterThan(0);
      }
    });
  });

  describe("cheapest-capable Auto routing", () => {
    it("routes design generation to Recraft V4.1, never the Pro tier", () => {
      expect(registry.cheapestCapable("design").slug).toBe("recraft-v4.1");
    });

    it("routes svg generation to the non-Pro Vector model", () => {
      expect(registry.cheapestCapable("svg").slug).toBe("recraft-v4.1-svg");
    });

    it("routes general generation to the cheapest general model", () => {
      const winner = registry.cheapestCapable("general");
      const generalCosts = registry
        .listModels()
        .filter((entry) => entry.capabilities.includes("general"))
        .map((entry) => entry.costCentsPerCall);
      expect(winner.costCentsPerCall).toBe(Math.min(...generalCosts));
    });

    it("routes edits to an edit-capable model, never a Recraft model", () => {
      const winner = registry.cheapestCapable("edit");
      expect(winner.capabilities).toContain("edit");
      expect(winner.replicateId.startsWith("recraft-ai/")).toBe(false);
    });

    it("never escalates price above an equally-capable candidate", () => {
      const winner = registry.cheapestCapable("edit");
      for (const entry of registry.listModels()) {
        if (entry.capabilities.includes("edit")) {
          expect(winner.costCentsPerCall).toBeLessThanOrEqual(
            entry.costCentsPerCall,
          );
        }
      }
    });
  });

  describe("pin validation", () => {
    it("resolves a valid pin", () => {
      expect(registry.resolvePin("nano-banana-2")?.slug).toBe("nano-banana-2");
    });

    it("returns null for a stale slug so the project reverts to Auto", () => {
      expect(registry.resolvePin("recraft-v3")).toBeNull();
    });

    it("returns null for an absent pin (Auto mode)", () => {
      expect(registry.resolvePin(undefined)).toBeNull();
    });
  });

  describe("aspect-ratio validate-and-fallback", () => {
    it("passes an allowlisted ratio through", () => {
      expect(registry.resolveAspectRatio("recraft-v4.1", "16:9")).toBe("16:9");
    });

    it("falls back to the model default for unknown ratios", () => {
      expect(registry.resolveAspectRatio("recraft-v4.1", "banana")).toBe("1:1");
    });

    it("falls back to the model default when nothing was requested", () => {
      expect(registry.resolveAspectRatio("recraft-v4.1")).toBe("1:1");
    });
  });

  describe("timeout budget", () => {
    it("clamps fast models up to the 60s floor", () => {
      // Recraft V4.1 hint is 6s → 18s raw → clamped to 60s.
      expect(registry.timeoutMsFor("recraft-v4.1")).toBe(60_000);
    });

    it("clamps slow models down to the 180s ceiling", () => {
      // GPT Image 2 hint is 45s → 135s raw, within bounds.
      expect(registry.timeoutMsFor("gpt-image-2")).toBe(135_000);
    });

    it("never exceeds 180s for any roster entry", () => {
      for (const entry of registry.listModels()) {
        expect(registry.timeoutMsFor(entry.slug)).toBeLessThanOrEqual(180_000);
      }
    });
  });

  describe("input shaping", () => {
    it("builds Recraft generate input with only prompt and aspect_ratio", () => {
      const input = registry.buildGenerateInput(
        "recraft-v4.1",
        "a logo",
        "16:9",
      );
      expect(input).toEqual({ prompt: "a logo", aspect_ratio: "16:9" });
    });

    it("builds Nano Banana edit input with prompt and image_input", () => {
      const input = registry.buildEditInput("nano-banana-2", "make it bolder", [
        "https://example.com/a.webp",
      ]);
      expect(input).toEqual({
        prompt: "make it bolder",
        image_input: ["https://example.com/a.webp"],
        // png, not webp — the lite tier rejects webp (regression test).
        output_format: "png",
      });
    });

    it("refuses edit input for models without the edit capability", () => {
      expect(() =>
        registry.buildEditInput("recraft-v4.1", "edit this", [
          "https://example.com/a.webp",
        ]),
      ).toThrow("cannot edit");
    });
  });

  describe("utilities", () => {
    it("maps remove_background to the verified Recraft utility", () => {
      expect(registry.getUtility("remove_background").replicateId).toBe(
        "recraft-ai/recraft-remove-background",
      );
    });

    it("maps vectorize to the verified Recraft utility", () => {
      expect(registry.getUtility("vectorize").replicateId).toBe(
        "recraft-ai/recraft-vectorize",
      );
    });
  });
});
