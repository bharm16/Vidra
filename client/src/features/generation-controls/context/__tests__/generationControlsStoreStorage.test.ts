import { beforeEach, describe, expect, it } from "vitest";
import type { GenerationControlsState } from "../generationControlsStoreTypes";
import { loadGenerationControlsStoreState } from "../generationControlsStoreStorage";

const SAMPLE_STATE: GenerationControlsState = {
  domain: {
    selectedModel: "model-1",
    generationParams: { aspect_ratio: "16:9", duration_s: 5 },
    videoTier: "draft",
    keyframes: [
      {
        id: "kf-1",
        url: "https://storage.example.com/frame1.png",
        source: "upload",
        storagePath: "uploads/frame1.png",
      },
    ],
    startFrame: {
      id: "start-frame-1",
      url: "https://storage.example.com/frame1.png",
      source: "upload",
      storagePath: "uploads/frame1.png",
    },
    endFrame: {
      id: "end-frame-1",
      url: "https://storage.example.com/frame2.png",
      source: "upload",
      storagePath: "uploads/frame2.png",
    },
    videoReferenceImages: [
      {
        id: "ref-1",
        url: "https://storage.example.com/reference1.png",
        referenceType: "asset",
        source: "upload",
      },
    ],
    extendVideo: {
      url: "https://storage.example.com/video.mp4",
      source: "generation",
      generationId: "gen-1",
    },
    cameraMotion: {
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
    },
    subjectMotion: "Walk forward",
  },
  ui: {
    activeTab: "image",
    imageSubTab: "styles",
  },
};

beforeEach(() => {
  localStorage.clear();
});

describe("generationControlsStoreStorage", () => {
  it("loads from new storage key when present", () => {
    localStorage.setItem(
      "prompt-optimizer:generationControlsStore",
      JSON.stringify(SAMPLE_STATE),
    );
    expect(loadGenerationControlsStoreState()).toEqual(SAMPLE_STATE);
  });

  it("migrates from legacy keys when new key is missing", () => {
    localStorage.setItem("prompt-optimizer:selectedModel", "legacy-model");
    localStorage.setItem(
      "prompt-optimizer:generationParams",
      JSON.stringify({ aspect_ratio: "9:16" }),
    );
    localStorage.setItem("prompt-optimizer:videoTier", "render");
    localStorage.setItem(
      "generation-controls:keyframes",
      JSON.stringify([
        {
          id: "legacy-kf",
          url: "https://example.com/legacy.png",
          source: "upload",
        },
      ]),
    );
    localStorage.setItem(
      "generation-controls:cameraMotion",
      JSON.stringify({
        id: "static",
        label: "Static",
        category: "static",
        start: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { pitch: 0, yaw: 0, roll: 0 },
        },
        end: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { pitch: 0, yaw: 0, roll: 0 },
        },
        duration: 1,
      }),
    );
    localStorage.setItem("generation-controls:subjectMotion", "Legacy motion");
    localStorage.setItem("generation-controls:activeTab", "video");
    localStorage.setItem("generation-controls:imageSubTab", "references");

    const loaded = loadGenerationControlsStoreState();
    expect(loaded.domain.selectedModel).toBe("legacy-model");
    expect(loaded.domain.generationParams).toEqual({ aspect_ratio: "9:16" });
    expect(loaded.domain.videoTier).toBe("render");
    expect(loaded.domain.keyframes).toHaveLength(1);
    expect(loaded.domain.startFrame?.id).toBe("legacy-kf");
    expect(loaded.domain.endFrame).toBeNull();
    expect(loaded.domain.videoReferenceImages).toEqual([]);
    expect(loaded.domain.extendVideo).toBeNull();
    expect(loaded.domain.cameraMotion?.id).toBe("static");
    expect(loaded.domain.subjectMotion).toBe("Legacy motion");
    expect(loaded.ui.activeTab).toBe("video");
    expect(loaded.ui.imageSubTab).toBe("references");
  });

  it("falls back to legacy keys when new key is invalid", () => {
    localStorage.setItem(
      "prompt-optimizer:generationControlsStore",
      "not json",
    );
    localStorage.setItem("prompt-optimizer:selectedModel", "legacy-model");

    const loaded = loadGenerationControlsStoreState();
    expect(loaded.domain.selectedModel).toBe("legacy-model");
  });

  it("migrates start frame from keyframes[0] when stored state has no startFrame", () => {
    localStorage.setItem(
      "prompt-optimizer:generationControlsStore",
      JSON.stringify({
        domain: {
          selectedModel: "model-legacy",
          generationParams: {},
          videoTier: "render",
          keyframes: [
            {
              id: "legacy-start",
              url: "https://example.com/legacy-start.png",
              source: "upload",
            },
          ],
          cameraMotion: null,
          subjectMotion: "",
        },
        ui: {
          activeTab: "video",
          imageSubTab: "references",
        },
      }),
    );

    const loaded = loadGenerationControlsStoreState();
    expect(loaded.domain.startFrame?.id).toBe("legacy-start");
    expect(loaded.domain.startFrame?.url).toBe(
      "https://example.com/legacy-start.png",
    );
    expect(loaded.domain.endFrame).toBeNull();
    expect(loaded.domain.videoReferenceImages).toEqual([]);
    expect(loaded.domain.extendVideo).toBeNull();
  });
});
