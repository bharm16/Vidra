import { describe, expect, it } from "vitest";

import {
  SessionGenerationRecordSchema,
  SessionPromptVersionEntrySchema,
  TAKE_ORIGINS,
} from "#shared/schemas/session.schemas";

/**
 * The admission contract on the take record — ADR-0022 decisions 1, 2, 3.
 *
 * A picture may now enter a session from an upload, the sketchpad, or the
 * studio, so "where did this come from" stopped being answerable from the
 * generation that produced it. Three facts moved onto the record:
 *
 *  - `origin` — a CLOSED set, recorded at admission, never inferred later from
 *    which other fields happen to be populated. Closed is the point: an
 *    unrecognized origin must be rejected rather than rendered as a plausible
 *    lie.
 *  - `productionProvenance` — what actually produced the media, with an
 *    explicit `unknown`. An upload records unknown rather than an invented
 *    prompt (decision 2).
 *  - `sourceInputs` — every contributing input, in full. The ONE the space
 *    draws is `ancestorGenerationId`, the display ancestor (decision 3).
 *
 * They are validated here, at the wire, rather than declared as TypeScript
 * interfaces: the record crosses the boundary as an open bag, and a field that
 * only `tsc` believes in is a field the server can silently stop writing.
 */

const versionEntry = (generations: unknown[]) => ({
  versionId: "v1",
  signature: "sig-1",
  prompt: "A runner on a rain-slicked street",
  timestamp: "2026-09-17T00:00:00Z",
  generations,
});

describe("take admission contract (ADR-0022 decisions 1-3)", () => {
  it("publishes exactly the four origins the ADR names", () => {
    expect([...TAKE_ORIGINS]).toEqual([
      "generated",
      "upload",
      "sketchpad",
      "studio",
    ]);
  });

  it.each(TAKE_ORIGINS)("round-trips a take whose origin is %s", (origin) => {
    const result = SessionGenerationRecordSchema.safeParse({
      id: "gen-1",
      ancestorGenerationId: null,
      origin,
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.origin).toBe(origin);
  });

  it("rejects an unknown origin at the wire instead of passing it through the open bag", () => {
    for (const origin of ["pasted", "", "UPLOAD", 1, null]) {
      expect(
        SessionGenerationRecordSchema.safeParse({ id: "gen-1", origin })
          .success,
      ).toBe(false);
    }
  });

  it("rejects an unknown origin through a version entry's generations array too", () => {
    expect(
      SessionPromptVersionEntrySchema.safeParse(
        versionEntry([{ id: "gen-1", origin: "screenshot" }]),
      ).success,
    ).toBe(false);
  });

  it("records an upload's production provenance as explicitly unknown", () => {
    const result = SessionGenerationRecordSchema.safeParse({
      id: "gen-1",
      ancestorGenerationId: null,
      origin: "upload",
      productionProvenance: { state: "unknown" },
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.productionProvenance).toEqual({
      state: "unknown",
    });
  });

  it("records a known provenance as its instruction, which is not the associated words", () => {
    const result = SessionGenerationRecordSchema.safeParse({
      id: "gen-1",
      ancestorGenerationId: "gen-src",
      origin: "studio",
      // The associated words the take is FILED under.
      prompt: "A runner on a rain-slicked street",
      // What actually produced it. Restoring this into the input would be
      // nonsense — decision 2 exists so the two can never be conflated.
      productionProvenance: {
        state: "known",
        instruction: "remove the chair",
        model: "flux-kontext",
      },
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.productionProvenance).toEqual({
      state: "known",
      instruction: "remove the chair",
      model: "flux-kontext",
    });
  });

  it("rejects a provenance that is neither known nor unknown", () => {
    for (const productionProvenance of [
      { state: "maybe" },
      { state: "known" }, // no instruction
      "unknown",
      null,
    ]) {
      expect(
        SessionGenerationRecordSchema.safeParse({
          id: "gen-1",
          productionProvenance,
        }).success,
      ).toBe(false);
    }
  });

  it("records two source inputs in full and still exposes one display ancestor", () => {
    const result = SessionGenerationRecordSchema.safeParse({
      id: "gen-1",
      origin: "studio",
      sourceInputs: [
        { kind: "take", generationId: "gen-src", assetId: "asset-src" },
        { kind: "studio-image", assetId: "asset-ref" },
      ],
      // Decision 3: one of the inputs is the display ancestor, and it is what
      // the space draws. Recorded, never guessed from sibling order.
      ancestorGenerationId: "gen-src",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.sourceInputs).toHaveLength(2);
    expect(result.data.sourceInputs?.map((input) => input.kind)).toEqual([
      "take",
      "studio-image",
    ]);
    expect(result.data.ancestorGenerationId).toBe("gen-src");
  });

  it("allows source inputs with no display ancestor — the ancestry is then explicitly unknown", () => {
    const result = SessionGenerationRecordSchema.safeParse({
      id: "gen-1",
      origin: "upload",
      sourceInputs: [{ kind: "upload", assetId: "asset-uploaded" }],
      ancestorGenerationId: null,
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.ancestorGenerationId).toBeNull();
  });

  it("rejects a source input whose kind is outside the closed set", () => {
    expect(
      SessionGenerationRecordSchema.safeParse({
        id: "gen-1",
        sourceInputs: [{ kind: "screenshot" }],
      }).success,
    ).toBe(false);
  });

  it("stays additive: a record written before this contract still parses", () => {
    const result = SessionGenerationRecordSchema.safeParse({
      id: "gen-legacy",
      ancestorGenerationId: "gen-pic-1",
      archived: false,
      tier: "render",
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.origin).toBeUndefined();
  });
});
