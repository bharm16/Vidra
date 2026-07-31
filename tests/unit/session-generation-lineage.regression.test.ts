import { describe, expect, it } from "vitest";

import {
  SessionGenerationRecordSchema,
  SessionPromptVersionEntrySchema,
} from "#shared/schemas/session.schemas";

/**
 * Regression: the ADR-0013 lineage fields were declared on the TypeScript
 * `SessionGenerationRecord` but existed nowhere in the Zod contract —
 * `generations` parsed as `z.array(z.record(z.string(), z.unknown()))`. A
 * record whose `ancestorGenerationId` was a number (or `false`, or an object)
 * parsed clean, and the space then read it as a root node: the picture→clip
 * edge silently disappeared with no parse error anywhere to point at it.
 *
 * Invariant: the three fields the space navigates by — `id`,
 * `ancestorGenerationId`, `archived` — are validated by the same schema that
 * accepts the rest of the record as an open bag.
 */

const versionEntry = (generations: unknown[]) => ({
  versionId: "v1",
  signature: "sig-1",
  prompt: "A runner on a rain-slicked street",
  timestamp: "2026-07-06T00:00:00Z",
  generations,
});

describe("SessionGenerationRecord lineage contract (ADR-0013)", () => {
  it("round-trips a clip that names its source picture", () => {
    const record = {
      id: "gen-clip-1",
      ancestorGenerationId: "gen-pic-1",
      archived: false,
    };

    const result = SessionGenerationRecordSchema.safeParse(record);

    expect(result.success).toBe(true);
    expect(result.success && result.data).toMatchObject(record);
  });

  it("round-trips a root picture (null ancestor) and an archived leaf", () => {
    expect(
      SessionGenerationRecordSchema.safeParse({
        id: "gen-pic-1",
        ancestorGenerationId: null,
      }).success,
    ).toBe(true);

    const archived = SessionGenerationRecordSchema.safeParse({
      id: "gen-pic-2",
      ancestorGenerationId: "gen-pic-1",
      archived: true,
    });

    expect(archived.success).toBe(true);
    expect(archived.success && archived.data.archived).toBe(true);
  });

  it("keeps the rest of the record's bag intact (schema addition, not narrowing)", () => {
    const result = SessionGenerationRecordSchema.safeParse({
      id: "gen-pic-1",
      ancestorGenerationId: null,
      tier: "render",
      status: "completed",
      imageUrl: "https://storage.example.com/pic.png",
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.tier).toBe("render");
    expect(result.success && result.data.status).toBe("completed");
  });

  it("rejects a mistyped ancestorGenerationId instead of rendering it as a root", () => {
    for (const ancestorGenerationId of [42, false, {}, ["gen-pic-1"]]) {
      expect(
        SessionGenerationRecordSchema.safeParse({
          id: "gen-clip-1",
          ancestorGenerationId,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects a mistyped archived flag instead of treating it as removed", () => {
    for (const archived of ["true", 1, null]) {
      expect(
        SessionGenerationRecordSchema.safeParse({
          id: "gen-pic-1",
          archived,
        }).success,
      ).toBe(false);
    }
  });

  it("applies the same validation through a version entry's generations array", () => {
    expect(
      SessionPromptVersionEntrySchema.safeParse(
        versionEntry([
          { id: "gen-pic-1", ancestorGenerationId: null },
          { id: "gen-clip-1", ancestorGenerationId: "gen-pic-1" },
        ]),
      ).success,
    ).toBe(true);

    expect(
      SessionPromptVersionEntrySchema.safeParse(
        versionEntry([{ id: "gen-clip-1", ancestorGenerationId: 42 }]),
      ).success,
    ).toBe(false);
  });
});
