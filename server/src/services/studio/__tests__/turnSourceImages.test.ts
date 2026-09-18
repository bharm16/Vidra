import { describe, expect, it } from "vitest";
import { readTurnSourceImages } from "../turnSourceImages";
import type { StudioDecision, StudioTurnRecord } from "../types";

/**
 * The provenance classifier — ADR-0022 decision 4, issue #89.
 *
 * What a turn consumed is read from `decision.action`, which is already a
 * discriminated union, and from the inputs the service resolved at dispatch.
 * Nothing about this read looks at prompts, ids or filenames: an unrelated
 * generation is distinguished from an edit by what the turn IS, not by what
 * its text resembles.
 */

function turn(
  decision: StudioDecision,
  sourceImages?: Array<{ id: string; storagePath: string }>,
): StudioTurnRecord {
  return {
    id: "turn-1",
    projectId: "project-1",
    userId: "user-1",
    status: "complete",
    userMessage: "…",
    decision,
    ...(sourceImages ? { sourceImages } : {}),
    calls: [],
    reservedCents: 0,
    refundedCents: 0,
    createdAtMs: 0,
    updatedAtMs: 0,
  };
}

const SOURCES = [
  { id: "img-1", storagePath: "users/user-1/previews/images/a.png" },
  { id: "img-2", storagePath: "users/user-1/previews/images/b.png" },
];

describe("readTurnSourceImages", () => {
  it("reports no inputs for a generate, even inside a project born from a session picture", () => {
    const generated = turn({
      action: "generate",
      basePrompt: "a paper crane",
      variants: ["a", "b", "c", "d"],
      capability: "general",
      suggestions: ["x", "y", "z"],
    });

    // The case the whole rule exists for: a generate consumed nothing, so the
    // returning picture can inherit no ancestry from the project's origin.
    expect(readTurnSourceImages(generated)).toEqual([]);
  });

  it("reports every resolved input of an edit", () => {
    const edited = turn(
      {
        action: "edit",
        instruction: "combine them",
        sourceImageIds: ["img-1", "img-2"],
        suggestions: ["x", "y", "z"],
      },
      SOURCES,
    );

    expect(readTurnSourceImages(edited)).toEqual(SOURCES);
  });

  it("reports the resolved input of a transform", () => {
    const transformed = turn(
      {
        action: "transform",
        operation: "remove_background",
        sourceImageId: "img-1",
        suggestions: ["x", "y", "z"],
      },
      [SOURCES[0]!],
    );

    expect(readTurnSourceImages(transformed)).toEqual([SOURCES[0]]);
  });

  it("reads a turn written before the field existed as having no inputs, rather than inventing them", () => {
    const legacyEdit = turn({
      action: "edit",
      instruction: "warm the light",
      sourceImageIds: ["img-1"],
      suggestions: ["x", "y", "z"],
    });

    // The decision still names an id, and that is exactly what must NOT be
    // trusted: it is what the LLM asked for, not what ran.
    expect(readTurnSourceImages(legacyEdit)).toEqual([]);
  });

  it("reads a malformed persisted field as no inputs", () => {
    const corrupt = turn(
      {
        action: "edit",
        instruction: "warm the light",
        sourceImageIds: ["img-1"],
        suggestions: ["x", "y", "z"],
      },
      [{ id: "img-1" } as never],
    );

    expect(readTurnSourceImages(corrupt)).toEqual([]);
  });

  it("reports no inputs for a conversational turn", () => {
    expect(
      readTurnSourceImages(
        turn({ action: "diagnose", question: "which one?", quickPicks: [] }),
      ),
    ).toEqual([]);
  });
});
