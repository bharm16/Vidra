import { describe, it, expect, vi, afterEach } from "vitest";
import type { PromptVersionEdit } from "@features/prompt-optimizer/types/domain/prompt-session";
import { mintVersionId, buildVersionEditMetadata } from "../versioning";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mintVersionId", () => {
  it("varies the suffix with the random draw", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const rand = vi.spyOn(Math, "random");
    rand.mockReturnValueOnce(0.5);
    const a = mintVersionId();
    rand.mockReturnValueOnce(0.25);
    const b = mintVersionId();
    expect(a).not.toBe(b);
  });
});

describe("buildVersionEditMetadata", () => {
  const edit: PromptVersionEdit = { timestamp: "2026-01-01T00:00:00.000Z" };

  it("includes edits only when non-empty, and as a copy", () => {
    const edits = [edit];
    const result = buildVersionEditMetadata(0, edits);
    expect(result).toEqual({ edits: [edit] });
    expect(result.edits).not.toBe(edits);
  });

  it("includes both editCount and edits when both are present", () => {
    expect(buildVersionEditMetadata(2, [edit])).toEqual({
      editCount: 2,
      edits: [edit],
    });
  });
});
