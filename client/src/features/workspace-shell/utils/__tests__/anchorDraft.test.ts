import { afterEach, describe, expect, it } from "vitest";

import {
  clearAnchorDraft,
  readAnchorDraft,
  writeAnchorDraft,
} from "../anchorDraft";

describe("anchorDraft storage", () => {
  afterEach(() => clearAnchorDraft());

  it("returns an empty string when no draft is stored", () => {
    expect(readAnchorDraft()).toBe("");
  });

  it("round-trips a written draft", () => {
    writeAnchorDraft("A lighthouse at dusk");
    expect(readAnchorDraft()).toBe("A lighthouse at dusk");
  });

  it("treats an empty write as a clear (empty === no draft)", () => {
    writeAnchorDraft("something");
    writeAnchorDraft("");
    expect(readAnchorDraft()).toBe("");
  });

  it("clearAnchorDraft removes a stored draft", () => {
    writeAnchorDraft("keep me? no");
    clearAnchorDraft();
    expect(readAnchorDraft()).toBe("");
  });
});
