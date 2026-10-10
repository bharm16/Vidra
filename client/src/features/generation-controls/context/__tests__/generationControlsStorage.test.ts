import { beforeEach, describe, expect, it } from "vitest";

import { loadCameraMotion, loadKeyframes } from "../generationControlsStorage";

// The persist* writers were deleted 2026-08-27 — legacy keys are no longer
// written, only migrated on load for one release (see the note in
// generationControlsStoreStorage.ts). These tests seed the legacy keys
// directly, the way a returning browser would present them.

beforeEach(() => {
  localStorage.clear();
});

describe("generationControlsStorage", () => {
  it("returns null for corrupted camera motion data", () => {
    localStorage.setItem("generation-controls:cameraMotion", "not json");
    expect(loadCameraMotion()).toBeNull();

    localStorage.setItem(
      "generation-controls:cameraMotion",
      JSON.stringify({ id: "bad" }),
    );
    expect(loadCameraMotion()).toBeNull();
  });

  describe("keyframes", () => {
    it("returns empty array for corrupted keyframes data", () => {
      localStorage.setItem("generation-controls:keyframes", "not json");
      expect(loadKeyframes()).toEqual([]);

      localStorage.setItem(
        "generation-controls:keyframes",
        JSON.stringify([{ id: "bad" }]),
      );
      expect(loadKeyframes()).toEqual([]);
    });
  });
});
