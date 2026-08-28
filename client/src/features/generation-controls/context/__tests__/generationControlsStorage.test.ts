import { beforeEach, describe, expect, it } from "vitest";
import type { KeyframeTile } from "../../types";
import type { CameraPath } from "@/features/convergence/types";
import {
  loadCameraMotion,
  loadKeyframes,
  loadSubjectMotion,
} from "../generationControlsStorage";

// The persist* writers were deleted 2026-08-27 — legacy keys are no longer
// written, only migrated on load for one release (see the note in
// generationControlsStoreStorage.ts). These tests seed the legacy keys
// directly, the way a returning browser would present them.
const seed = (key: string, value: unknown): void => {
  localStorage.setItem(key, JSON.stringify(value));
};

const SAMPLE_CAMERA_MOTION: CameraPath = {
  id: "pan_left",
  label: "Pan Left",
  category: "pan_tilt",
  start: {
    position: { x: 0, y: 0, z: 0 },
    rotation: { pitch: 0, yaw: 0, roll: 0 },
  },
  end: {
    position: { x: 1, y: 0, z: 0 },
    rotation: { pitch: 0, yaw: 0.1, roll: 0 },
  },
  duration: 1,
};

beforeEach(() => {
  localStorage.clear();
});

describe("generationControlsStorage", () => {
  it("loads camera motion from the legacy key", () => {
    seed("generation-controls:cameraMotion", SAMPLE_CAMERA_MOTION);
    expect(loadCameraMotion()).toEqual(SAMPLE_CAMERA_MOTION);
  });

  it("returns null for corrupted camera motion data", () => {
    localStorage.setItem("generation-controls:cameraMotion", "not json");
    expect(loadCameraMotion()).toBeNull();

    localStorage.setItem(
      "generation-controls:cameraMotion",
      JSON.stringify({ id: "bad" }),
    );
    expect(loadCameraMotion()).toBeNull();
  });

  it("loads subject motion from the legacy key", () => {
    localStorage.setItem("generation-controls:subjectMotion", "Walks forward");
    expect(loadSubjectMotion()).toBe("Walks forward");
  });

  describe("keyframes", () => {
    const SAMPLE_KEYFRAMES: KeyframeTile[] = [
      {
        id: "kf-1",
        url: "https://storage.example.com/frame1.png",
        source: "upload",
        storagePath: "uploads/frame1.png",
      },
      {
        id: "kf-2",
        url: "https://storage.example.com/frame2.png",
        source: "asset",
        assetId: "asset-123",
      },
    ];

    it("loads keyframes from the legacy key", () => {
      seed("generation-controls:keyframes", SAMPLE_KEYFRAMES);
      expect(loadKeyframes()).toEqual(SAMPLE_KEYFRAMES);
    });

    it("returns empty array for corrupted keyframes data", () => {
      localStorage.setItem("generation-controls:keyframes", "not json");
      expect(loadKeyframes()).toEqual([]);

      localStorage.setItem(
        "generation-controls:keyframes",
        JSON.stringify([{ id: "bad" }]),
      );
      expect(loadKeyframes()).toEqual([]);
    });

    it("loads single keyframe", () => {
      seed("generation-controls:keyframes", SAMPLE_KEYFRAMES.slice(0, 1));
      const loaded = loadKeyframes();
      expect(loaded).toHaveLength(1);
      expect(loaded[0]?.id).toBe("kf-1");
    });
  });
});
