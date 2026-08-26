import { describe, it, expect, vi, afterEach } from "vitest";
import type { PromptVersionEdit } from "@features/prompt-optimizer/types/domain/prompt-session";
import { mintVersionId, buildVersionEditMetadata } from "../versioning";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mintVersionId", () => {
  it("produces a v-<epoch>-<base36-suffix> id", () => {
    vi.spyOn(Date, "now").mockReturnValue(1735689600000);
    vi.spyOn(Math, "random").mockReturnValue(0.5); // (0.5).toString(36) === "0.i"
    expect(mintVersionId()).toBe("v-1735689600000-i");
  });

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

  it("returns an empty object when there is nothing to record", () => {
    expect(buildVersionEditMetadata(0, [])).toEqual({});
  });

  it("includes editCount only when positive", () => {
    expect(buildVersionEditMetadata(3, [])).toEqual({ editCount: 3 });
  });

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
