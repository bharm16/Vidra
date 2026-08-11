import { describe, expect, it } from "vitest";
import type { Generation } from "@features/generations/types";
import { normalizePersistedGeneration } from "../normalizePersistedGeneration";
import { selectHeroGeneration } from "../selectHeroGeneration";

// Test fixture shape for legacy persisted records. Real `Generation` requires
// a `mediaType` and constrains `tier` to the current union, but historical
// data may have either field missing or carrying a deprecated value (e.g. the
// pre-rename tier `"final"`). Modelling the laxer shape here keeps the
// production type strict while letting fixtures faithfully reproduce the
// on-disk legacy shape — a single contained boundary cast in `buildGeneration`
// replaces several scattered `as unknown as` casts at call sites.
// Note the explicit `| undefined` — the project compiles with
// `exactOptionalPropertyTypes: true`, so an optional property without
// `undefined` in its type forbids assigning `undefined` to it. Legacy
// records genuinely have `mediaType: undefined` after parse, so we need
// both the optional marker AND the explicit undefined.
type LegacyGeneration = Omit<Generation, "mediaType" | "tier"> & {
  mediaType?: Generation["mediaType"] | undefined;
  tier: Generation["tier"] | "final";
};

// Regression: ISSUE-26 (follow-up — legacy data case)
//
// Invariant: storyboard generations persisted before the server started
// stamping `mediaType: "image-sequence"` (the ISSUE-30 fix) carry an
// undefined `mediaType` field. They MUST still be treated as storyboards
// for hero-selection purposes, otherwise they leak into `nonStoryboard`
// and shadow legitimate render-tier video generations on the canvas.
//
// The stable signal for legacy detection is the server-hardcoded model
// name `"flux-kontext"` — see server/src/routes/preview/handlers/imageStoryboardGenerate.ts.
//
// Live repro (Tokyo alleyway session, 2026-04-30): the session had two
// flux-kontext draft records (mediaType undefined) and one Sora video
// (tier "render", mediaType "video"). The hero defaulted to the most
// recent flux-kontext record because the legacy storyboards leaked
// through the `mediaType !== "image-sequence"` filter.

const buildGeneration = (
  overrides: Partial<LegacyGeneration> = {},
): Generation => {
  const fixture: LegacyGeneration = {
    id: overrides.id ?? "gen-1",
    tier: overrides.tier ?? "draft",
    status: overrides.status ?? "completed",
    model: overrides.model ?? "stub-model",
    prompt: overrides.prompt ?? "stub prompt",
    promptVersionId: overrides.promptVersionId ?? "v-1",
    createdAt: overrides.createdAt ?? 0,
    completedAt: overrides.completedAt ?? null,
    mediaType: overrides.mediaType,
    mediaUrls: overrides.mediaUrls ?? ["https://media.example/asset.mp4"],
    ...overrides,
  };
  // Single contained boundary cast: the production type is intentionally
  // stricter than the legacy on-disk shape this fixture reproduces.
  return fixture as Generation;
};

describe("regression: legacy storyboard records (no mediaType) still excluded from hero", () => {
  it("treats a flux-kontext record without mediaType as a storyboard", () => {
    const legacyStoryboard = buildGeneration({
      id: "kontext-legacy-1",
      tier: "draft",
      model: "flux-kontext",
      // mediaType deliberately omitted (undefined) to mirror the
      // persisted-pre-ISSUE-30 shape. The LegacyGeneration fixture type
      // permits this where the production Generation type would not.
      mediaType: undefined,
      mediaUrls: [
        "https://media.example/frame-1.png",
        "https://media.example/frame-2.png",
        "https://media.example/frame-3.png",
        "https://media.example/frame-4.png",
      ],
      createdAt: 200, // most recent
    });
    const renderVideo = buildGeneration({
      id: "render-1",
      tier: "render",
      model: "sora-2",
      mediaType: "video",
      mediaUrls: ["https://media.example/render.mp4"],
      createdAt: 100, // older than the legacy storyboard
    });

    const result = selectHeroGeneration({
      generations: [renderVideo, legacyStoryboard],
      // activeGenerationId defaults to the latest generation in
      // useGenerationsRuntime — which is the legacy storyboard. The
      // selector must still skip it and pick the render.
      activeGenerationId: "kontext-legacy-1",
      heroOverrideGenerationId: null,
    });

    expect(result?.id).toBe("render-1");
  });

  it("excludes flux-kontext records from hero even when no render exists", () => {
    const legacyStoryboardA = buildGeneration({
      id: "kontext-1",
      model: "flux-kontext",
      mediaType: undefined,
      createdAt: 10,
    });
    const legacyStoryboardB = buildGeneration({
      id: "kontext-2",
      model: "flux-kontext",
      mediaType: undefined,
      createdAt: 20,
    });

    const result = selectHeroGeneration({
      generations: [legacyStoryboardA, legacyStoryboardB],
      activeGenerationId: null,
      heroOverrideGenerationId: null,
    });

    expect(result).toBeNull();
  });

  it("does not treat a non-storyboard flux-kontext consumer as a storyboard if mediaType is video", () => {
    // Defensive: a future model might re-use the flux-kontext name for a
    // video output. Canonical signal (mediaType) wins over the heuristic.
    const videoFromFlux = buildGeneration({
      id: "flux-video",
      model: "flux-kontext",
      mediaType: "video",
      tier: "render",
    });

    const result = selectHeroGeneration({
      generations: [videoFromFlux],
      activeGenerationId: null,
      heroOverrideGenerationId: null,
    });

    expect(result?.id).toBe("flux-video");
  });

  it("keeps a legacy tier 'final' record on the hero, now via derivation", () => {
    // Live repro (Tokyo alleyway session, 2026-04-30): the persisted Sora
    // record had `tier: "final"` instead of the now-canonical `"render"`.
    //
    // selectHeroGeneration used to carry an explicit "final" allowlist. Since
    // ADR-0021 the tier is derived from `model` at the repository boundary, so
    // the persisted value — "final", "draft", or absent — never reaches the
    // selector at all. Driving the fixture through the real normalizer proves
    // the guarantee survived the move rather than merely relocating.
    const legacyRenderFinal = normalizePersistedGeneration({
      id: "sora-legacy",
      tier: "final",
      model: "sora-2",
      mediaType: "video",
      status: "completed",
      mediaUrls: ["https://example.com/sora.mp4"],
      createdAt: 50,
    });
    const newerDraftPreview = normalizePersistedGeneration({
      id: "draft-preview",
      tier: "draft",
      model: "wan-2.5",
      mediaType: "video",
      status: "completed",
      mediaUrls: ["https://example.com/wan.mp4"],
      createdAt: 100,
    });

    expect(legacyRenderFinal?.tier).toBe("render");
    expect(newerDraftPreview?.tier).toBe("draft");

    const result = selectHeroGeneration({
      generations: [legacyRenderFinal!, newerDraftPreview!],
      activeGenerationId: null,
      heroOverrideGenerationId: null,
    });

    // The newer draft must NOT shadow the legacy render.
    expect(result?.id).toBe("sora-legacy");
  });
});
