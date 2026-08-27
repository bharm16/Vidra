import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { KeyframeTile } from "../../types";
import type { CameraPath } from "@/features/convergence/types";
import {
  DEFAULT_GENERATION_CONTROLS_STATE,
  type GenerationControlsState,
} from "../generationControlsStoreTypes";
import {
  GenerationControlsStoreProvider,
  useGenerationControlsStoreActions,
  useGenerationControlsStoreState,
} from "../GenerationControlsStore";

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

type GenerationControlsStateOverrides = Partial<
  Omit<GenerationControlsState, "domain" | "ui">
> & {
  domain?: Partial<GenerationControlsState["domain"]>;
  ui?: Partial<GenerationControlsState["ui"]>;
};

const buildInitialState = (
  overrides: GenerationControlsStateOverrides = {},
): GenerationControlsState => ({
  ...DEFAULT_GENERATION_CONTROLS_STATE,
  ...overrides,
  domain: {
    ...DEFAULT_GENERATION_CONTROLS_STATE.domain,
    ...(overrides.domain ?? {}),
  },
  ui: {
    ...DEFAULT_GENERATION_CONTROLS_STATE.ui,
    ...(overrides.ui ?? {}),
  },
});

const buildWrapper =
  (initialState?: GenerationControlsState) =>
  ({ children }: { children: ReactNode }) => (
    <GenerationControlsStoreProvider
      {...(initialState ? { initialState } : {})}
    >
      {children}
    </GenerationControlsStoreProvider>
  );

describe("GenerationControlsStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizes keyframes to max 3", () => {
    const keyframes: KeyframeTile[] = Array.from({ length: 4 }, (_, index) => ({
      id: `kf-${index + 1}`,
      url: `https://example.com/${index + 1}.png`,
      source: "upload",
    }));

    const { result } = renderHook(
      () => ({
        state: useGenerationControlsStoreState(),
        actions: useGenerationControlsStoreActions(),
      }),
      { wrapper: buildWrapper() },
    );

    act(() => {
      result.current.actions.setKeyframes(keyframes);
    });

    expect(result.current.state.domain.keyframes).toHaveLength(3);
  });

  it("sets and clears start frame", () => {
    const { result } = renderHook(
      () => ({
        state: useGenerationControlsStoreState(),
        actions: useGenerationControlsStoreActions(),
      }),
      { wrapper: buildWrapper() },
    );

    const frame: KeyframeTile = {
      id: "start-frame-1",
      url: "https://example.com/start.png",
      source: "upload",
    };

    act(() => {
      result.current.actions.setStartFrame(frame);
    });

    expect(result.current.state.domain.startFrame).toEqual(frame);

    act(() => {
      result.current.actions.clearStartFrame();
    });

    expect(result.current.state.domain.startFrame).toBeNull();
  });

  it("clears extend mode when setting the start frame", () => {
    const initialState = buildInitialState({
      domain: {
        extendVideo: {
          url: "https://example.com/video.mp4",
          source: "generation",
          generationId: "gen-1",
        },
      },
    });

    const { result } = renderHook(
      () => ({
        state: useGenerationControlsStoreState(),
        actions: useGenerationControlsStoreActions(),
      }),
      { wrapper: buildWrapper(initialState) },
    );

    act(() => {
      result.current.actions.setStartFrame({
        id: "start-frame",
        url: "https://example.com/start.png",
        source: "upload",
      });
    });

    expect(result.current.state.domain.extendVideo).toBeNull();
  });

  it("clears frame and motion inputs when extend mode is set", () => {
    const initialState = buildInitialState({
      domain: {
        startFrame: {
          id: "start-frame",
          url: "https://example.com/start.png",
          source: "upload",
        },
        endFrame: {
          id: "end-frame",
          url: "https://example.com/end.png",
          source: "upload",
        },
        cameraMotion: SAMPLE_CAMERA_MOTION,
        subjectMotion: "Walk forward",
      },
    });

    const { result } = renderHook(
      () => ({
        state: useGenerationControlsStoreState(),
        actions: useGenerationControlsStoreActions(),
      }),
      { wrapper: buildWrapper(initialState) },
    );

    act(() => {
      result.current.actions.setExtendVideo({
        url: "https://example.com/video.mp4",
        source: "generation",
        generationId: "gen-1",
      });
    });

    expect(result.current.state.domain.extendVideo?.url).toBe(
      "https://example.com/video.mp4",
    );
    expect(result.current.state.domain.startFrame).toBeNull();
    expect(result.current.state.domain.endFrame).toBeNull();
    expect(result.current.state.domain.cameraMotion).toBeNull();
    expect(result.current.state.domain.subjectMotion).toBe("");
  });

  it("resets motion only when start frame identity changes", () => {
    const initialState = buildInitialState({
      domain: {
        startFrame: {
          id: "start-frame-1",
          url: "https://storage.example.com/frame.png?X-Goog-Signature=old",
          source: "upload",
        },
        cameraMotion: SAMPLE_CAMERA_MOTION,
        subjectMotion: "Walk forward",
      },
    });

    const { result } = renderHook(
      () => ({
        state: useGenerationControlsStoreState(),
        actions: useGenerationControlsStoreActions(),
      }),
      { wrapper: buildWrapper(initialState) },
    );

    act(() => {
      result.current.actions.setStartFrame({
        id: "start-frame-2",
        url: "https://storage.example.com/frame.png?X-Goog-Signature=new",
        source: "upload",
      });
    });

    expect(result.current.state.domain.cameraMotion).toEqual(
      SAMPLE_CAMERA_MOTION,
    );
    expect(result.current.state.domain.subjectMotion).toBe("Walk forward");

    act(() => {
      result.current.actions.setStartFrame({
        id: "start-frame-3",
        url: "https://storage.example.com/frame-next.png?X-Goog-Signature=new",
        source: "upload",
      });
    });

    expect(result.current.state.domain.cameraMotion).toBeNull();
    expect(result.current.state.domain.subjectMotion).toBe("");
  });

  it("returns same state reference on no-op updates", () => {
    const { result } = renderHook(
      () => ({
        state: useGenerationControlsStoreState(),
        actions: useGenerationControlsStoreActions(),
      }),
      { wrapper: buildWrapper() },
    );

    const previousState = result.current.state;
    act(() => {
      result.current.actions.setSubjectMotion(
        result.current.state.domain.subjectMotion,
      );
    });

    expect(result.current.state).toBe(previousState);
  });

  it("hydrates from storage and persists updates", async () => {
    vi.useFakeTimers();
    const hydratedState = buildInitialState({
      domain: {
        selectedModel: "model-x",
        generationParams: { aspect_ratio: "16:9" },
      },
      ui: {
        activeTab: "image",
      },
    });

    localStorage.setItem(
      "prompt-optimizer:generationControlsStore",
      JSON.stringify(hydratedState),
    );

    const { result } = renderHook(
      () => ({
        state: useGenerationControlsStoreState(),
        actions: useGenerationControlsStoreActions(),
      }),
      { wrapper: buildWrapper() },
    );

    expect(result.current.state.domain.selectedModel).toBe("model-x");
    expect(result.current.state.ui.activeTab).toBe("image");

    act(() => {
      result.current.actions.setSelectedModel("model-y");
    });

    // Persistence is debounced (2s) to avoid localStorage thrash on rapid edits.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    const persisted = JSON.parse(
      localStorage.getItem("prompt-optimizer:generationControlsStore") ?? "{}",
    ) as GenerationControlsState;
    expect(persisted.domain.selectedModel).toBe("model-y");
    vi.useRealTimers();
  });

  it("hydrates start frame from keyframes[0] when persisted state is missing startFrame", () => {
    localStorage.setItem(
      "prompt-optimizer:generationControlsStore",
      JSON.stringify({
        domain: {
          selectedModel: "",
          generationParams: {},
          videoTier: "render",
          keyframes: [
            {
              id: "legacy-kf",
              url: "https://example.com/legacy.png",
              source: "upload",
            },
          ],
          cameraMotion: null,
          subjectMotion: "",
        },
        ui: {
          activeTab: "video",
          imageSubTab: "references",
          constraintMode: "strict",
        },
      }),
    );

    const { result } = renderHook(() => useGenerationControlsStoreState(), {
      wrapper: buildWrapper(),
    });

    expect(result.current.domain.startFrame?.id).toBe("legacy-kf");
  });
});
