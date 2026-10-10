import { describe, expect, it } from "vitest";

import { resolveInitialGenerations } from "../resolveInitialGenerations";

describe("resolveInitialGenerations", () => {
  it("clears generations when no words-version is selected", () => {
    expect(resolveInitialGenerations(undefined, "")).toEqual([]);
  });

  it("preserves the panel's own state when an existing version is selected", () => {
    expect(resolveInitialGenerations(undefined, "v-1")).toBeUndefined();
  });
});
