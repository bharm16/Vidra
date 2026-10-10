import { describe, expect, it } from "vitest";
import { resolveProviderForModel } from "@services/capabilities/modelProviders";

/**
 * Golden oracle for the identity collapse.
 *
 * Each expectation below is the literal that used to live in the map being
 * checked, transcribed from the pre-refactor source. They exist so that
 * deriving those maps from `shared/modelIdentity.ts` cannot silently change
 * an answer — the failure mode this refactor was specifically at risk of.
 */

describe("model identity — derived maps match the literals they replaced", () => {
  it("resolveProviderForModel (capability id → vendor) keeps every prior answer", () => {
    // The seven keys the MODEL_PROVIDER_MAP literal carried.
    expect(resolveProviderForModel("runway-gen45")).toBe("runway");
    expect(resolveProviderForModel("luma-ray3")).toBe("luma");
    expect(resolveProviderForModel("sora-2")).toBe("openai");
    expect(resolveProviderForModel("veo-4")).toBe("google");
    expect(resolveProviderForModel("kling-26")).toBe("kling");
    expect(resolveProviderForModel("wan-2.2")).toBe("wan");
    expect(resolveProviderForModel("wan-2.5")).toBe("wan");
  });

  it("resolveProviderForModel keeps the answers that used to arrive via alias or registry fallback", () => {
    // veo-3 and kling-2.1 resolved through MODEL_ID_ALIASES; sora-2-pro
    // resolved through the findProviderForModel registry scan. The derived
    // map answers all three directly — same answers, fewer hops.
    expect(resolveProviderForModel("veo-3")).toBe("google");
    expect(resolveProviderForModel("kling-2.1")).toBe("kling");
    expect(resolveProviderForModel("sora-2-pro")).toBe("openai");
  });
});
