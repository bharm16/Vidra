import { describe, expect, it } from "vitest";
import { SessionPromptVersionEntrySchema } from "../schemas/session.schemas";

/**
 * Issue #116 (ADR-0013 M4): the reword parent is a PERSISTED fact on the words-
 * version entry, so it must survive the wire. `SessionPromptVersionEntrySchema`
 * is a closed object — a field it does not model is dropped on parse — so these
 * assert the contract now carries `rewordedFromVersionId` and validates it.
 */
describe("SessionPromptVersionEntrySchema reword parent (issue #116)", () => {
  const base = {
    versionId: "v-2",
    signature: "sig",
    prompt: "second wording",
    timestamp: "2026-09-18T00:00:00.000Z",
  };

  it("preserves the persisted reword parent through the wire", () => {
    const parsed = SessionPromptVersionEntrySchema.parse({
      ...base,
      rewordedFromVersionId: "v-1",
    });

    expect(parsed.rewordedFromVersionId).toBe("v-1");
  });

  it("accepts a root or legacy version that records no reword parent", () => {
    const parsed = SessionPromptVersionEntrySchema.parse(base);

    expect(parsed.rewordedFromVersionId).toBeUndefined();
  });

  it("rejects a non-string reword parent rather than rendering a bad edge", () => {
    expect(() =>
      SessionPromptVersionEntrySchema.parse({
        ...base,
        rewordedFromVersionId: 42,
      }),
    ).toThrow();
  });
});
