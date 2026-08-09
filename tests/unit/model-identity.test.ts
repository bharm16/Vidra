import { describe, expect, it } from "vitest";
import {
  CANONICAL_TO_VENDOR,
  CAPABILITY_ID_TO_VENDOR,
  GENERATION_ID_TO_ADAPTER,
  MODEL_IDENTITIES,
  isGenerable,
  primaryGenerationId,
} from "@shared/modelIdentity";
import { CANONICAL_PROMPT_MODEL_IDS } from "@shared/videoModels";
import { VIDEO_MODEL_PROVIDERS } from "@config/videoModelRegistry";
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
  it("VIDEO_MODEL_PROVIDERS (generation id → adapter)", () => {
    expect(VIDEO_MODEL_PROVIDERS).toEqual({
      "sora-2": "openai",
      "sora-2-pro": "openai",
      "kling-v2-1-master": "kling",
      "luma-ray3": "luma",
      "google/veo-3": "gemini",
      "wan-video/wan-2.2-t2v-fast": "replicate",
      "wan-video/wan-2.2-i2v-fast": "replicate",
      "wan-video/wan-2.5-i2v": "replicate",
      "wan-video/wan-2.5-i2v-fast": "replicate",
      "genmo/mochi-1-final": "replicate",
      "minimax/video-02": "replicate",
    });
  });

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

  it("the client vendor map (client/src/config/videoModels.ts AI_MODEL_PROVIDERS)", () => {
    // The client no longer keeps its own copy — `AI_MODEL_PROVIDERS` is now
    // exactly this value, so asserting it here covers the client map without
    // reaching across the client/server boundary from a server-project test.
    expect(CANONICAL_TO_VENDOR).toEqual({
      "runway-gen45": "runway",
      "luma-ray3": "luma",
      "sora-2": "openai",
      "veo-3": "google",
      "kling-2.1": "kling",
      "wan-2.2": "wan",
    });
  });
});

describe("model identity — invariants", () => {
  it("declares an identity for every canonical prompt model", () => {
    for (const id of CANONICAL_PROMPT_MODEL_IDS) {
      expect(MODEL_IDENTITIES[id]?.canonicalId).toBe(id);
    }
  });

  it("marks Runway describable but not callable, and everything else callable", () => {
    // The fact that used to be a hand-written `null` in AvailabilityGateService.
    expect(isGenerable("runway-gen45")).toBe(false);
    expect(primaryGenerationId("runway-gen45")).toBeUndefined();

    for (const id of CANONICAL_PROMPT_MODEL_IDS) {
      if (id === "runway-gen45") continue;
      expect(isGenerable(id)).toBe(true);
      expect(primaryGenerationId(id)).toBeTruthy();
    }
  });

  it("never lets two models claim the same capability id", () => {
    const claimed = Object.values(MODEL_IDENTITIES).flatMap(
      (identity) => identity.capabilityIds,
    );
    expect(claimed).toHaveLength(new Set(claimed).size);
    expect(Object.keys(CAPABILITY_ID_TO_VENDOR)).toHaveLength(claimed.length);
  });

  it("never lets two models claim the same generation id", () => {
    const ids = Object.values(MODEL_IDENTITIES).flatMap((identity) =>
      identity.generation.map((variant) => variant.id),
    );
    expect(ids).toHaveLength(new Set(ids).size);
  });

  it("routes every callable model to an adapter", () => {
    for (const identity of Object.values(MODEL_IDENTITIES)) {
      for (const variant of identity.generation) {
        expect(GENERATION_ID_TO_ADAPTER[variant.id]).toBe(variant.adapter);
      }
    }
  });
});
