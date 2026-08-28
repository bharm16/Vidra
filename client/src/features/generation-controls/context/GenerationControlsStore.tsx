import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import debounce from "lodash/debounce";
import type { CapabilityValues } from "@shared/capabilities";
import type { CameraPath } from "@/features/convergence/types";
import type { KeyframeTile, VideoTier } from "../types";
import {
  DEFAULT_GENERATION_CONTROLS_STATE,
  type ExtendVideoSource,
  type GenerationControlsState,
  type GenerationControlsTab,
  type ImageSubTab,
  type VideoReferenceImage,
} from "./generationControlsStoreTypes";
import {
  loadGenerationControlsStoreState,
  persistGenerationControlsStoreState,
} from "./generationControlsStoreStorage";

const MAX_KEYFRAMES = 3;
const MAX_VIDEO_REFERENCES = 3;

type GenerationControlsAction =
  | { type: "setSelectedModel"; value: string }
  | { type: "setGenerationParams"; value: CapabilityValues }
  | { type: "mergeGenerationParams"; value: CapabilityValues }
  | { type: "setVideoTier"; value: VideoTier }
  | { type: "setStartFrame"; value: KeyframeTile | null }
  | { type: "clearStartFrame" }
  | { type: "clearEndFrame" }
  | {
      type: "updateVideoReferenceType";
      value: { id: string; referenceType: "asset" | "style" };
    }
  | { type: "clearVideoReferences" }
  | { type: "setExtendVideo"; value: ExtendVideoSource | null }
  | { type: "clearExtendVideo" }
  | { type: "setKeyframes"; value: KeyframeTile[] | null | undefined }
  | { type: "addKeyframe"; value: Omit<KeyframeTile, "id"> }
  | { type: "clearKeyframes" }
  | { type: "setCameraMotion"; value: CameraPath | null }
  | { type: "setSubjectMotion"; value: string }
  | { type: "resetState"; value: GenerationControlsState };

export interface GenerationControlsActions {
  setSelectedModel: (model: string) => void;
  setGenerationParams: (params: CapabilityValues) => void;
  mergeGenerationParams: (params: CapabilityValues) => void;
  setVideoTier: (tier: VideoTier) => void;
  setStartFrame: (tile: KeyframeTile | null) => void;
  clearStartFrame: () => void;
  clearEndFrame: () => void;
  updateVideoReferenceType: (
    id: string,
    referenceType: "asset" | "style",
  ) => void;
  clearVideoReferences: () => void;
  setExtendVideo: (source: ExtendVideoSource | null) => void;
  clearExtendVideo: () => void;
  setKeyframes: (tiles: KeyframeTile[] | null | undefined) => void;
  addKeyframe: (tile: Omit<KeyframeTile, "id">) => void;
  clearKeyframes: () => void;
  setCameraMotion: (cameraPath: CameraPath | null) => void;
  setSubjectMotion: (motion: string) => void;
  resetState: (state: GenerationControlsState) => void;
}

const GenerationControlsStateContext =
  createContext<GenerationControlsState | null>(null);
const GenerationControlsActionsContext =
  createContext<GenerationControlsActions | null>(null);

const normalizeKeyframes = (
  tiles: KeyframeTile[] | null | undefined,
): KeyframeTile[] => {
  if (!Array.isArray(tiles)) return [];
  return tiles.slice(0, MAX_KEYFRAMES);
};

const createKeyframeId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `keyframe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const areGenerationParamsEqual = (
  left: CapabilityValues,
  right: CapabilityValues,
): boolean => {
  if (left === right) return true;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.is(left[key], right[key])) return false;
  }
  return true;
};

const areKeyframeTilesEqual = (
  left: KeyframeTile | null | undefined,
  right: KeyframeTile | null | undefined,
): boolean => {
  if (left === right) return true;
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.id !== right.id) return false;
  if (left.url !== right.url) return false;
  if (left.source !== right.source) return false;
  if (left.assetId !== right.assetId) return false;
  if (left.sourcePrompt !== right.sourcePrompt) return false;
  if (left.storagePath !== right.storagePath) return false;
  if (left.viewUrlExpiresAt !== right.viewUrlExpiresAt) return false;
  return true;
};

const areKeyframesEqual = (
  left: KeyframeTile[],
  right: KeyframeTile[],
): boolean => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftFrame = left[index];
    const rightFrame = right[index];
    if (!areKeyframeTilesEqual(leftFrame, rightFrame)) return false;
  }
  return true;
};

const normalizeStartFrameIdentityUrl = (
  url: string | null | undefined,
): string | null => {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    const hashStripped = trimmed.split("#")[0] ?? trimmed;
    return hashStripped.split("?")[0] ?? hashStripped;
  }
};

const resolveStartFrameIdentity = (
  frame: KeyframeTile | null,
): string | null => {
  if (!frame) return null;
  const normalizedUrl = normalizeStartFrameIdentityUrl(frame.url);
  if (normalizedUrl) return normalizedUrl;

  const storagePath = frame.storagePath?.trim();
  if (storagePath) return `storage:${storagePath}`;
  const assetId = frame.assetId?.trim();
  if (assetId) return `asset:${assetId}`;
  return null;
};

const reconcileMotionAfterStartFrame = (
  state: GenerationControlsState,
  nextStartFrame: KeyframeTile | null,
): Pick<
  GenerationControlsState["domain"],
  "cameraMotion" | "subjectMotion"
> => {
  const previousIdentity = resolveStartFrameIdentity(state.domain.startFrame);
  const nextIdentity = resolveStartFrameIdentity(nextStartFrame);

  if (!nextIdentity) {
    if (!previousIdentity) {
      return {
        cameraMotion: state.domain.cameraMotion,
        subjectMotion: state.domain.subjectMotion,
      };
    }
    return { cameraMotion: null, subjectMotion: "" };
  }

  if (!previousIdentity) {
    return {
      cameraMotion: state.domain.cameraMotion,
      subjectMotion: state.domain.subjectMotion,
    };
  }

  if (previousIdentity !== nextIdentity) {
    return { cameraMotion: null, subjectMotion: "" };
  }

  return {
    cameraMotion: state.domain.cameraMotion,
    subjectMotion: state.domain.subjectMotion,
  };
};

const reducer = (
  state: GenerationControlsState,
  action: GenerationControlsAction,
): GenerationControlsState => {
  switch (action.type) {
    case "setSelectedModel":
      if (state.domain.selectedModel === action.value) return state;
      return {
        ...state,
        domain: { ...state.domain, selectedModel: action.value },
      };
    case "setGenerationParams":
      if (areGenerationParamsEqual(state.domain.generationParams, action.value))
        return state;
      return {
        ...state,
        domain: { ...state.domain, generationParams: action.value },
      };
    case "mergeGenerationParams": {
      const hasChanges = Object.keys(action.value).some(
        (key) =>
          !Object.is(state.domain.generationParams[key], action.value[key]),
      );
      if (!hasChanges) return state;
      return {
        ...state,
        domain: {
          ...state.domain,
          generationParams: {
            ...state.domain.generationParams,
            ...action.value,
          },
        },
      };
    }
    case "setVideoTier":
      if (state.domain.videoTier === action.value) return state;
      return {
        ...state,
        domain: { ...state.domain, videoTier: action.value },
      };
    case "setStartFrame": {
      const nextStartFrame = action.value;
      if (areKeyframeTilesEqual(state.domain.startFrame, nextStartFrame))
        return state;
      const motion = reconcileMotionAfterStartFrame(state, nextStartFrame);
      return {
        ...state,
        domain: {
          ...state.domain,
          startFrame: nextStartFrame,
          ...(nextStartFrame ? { extendVideo: null } : {}),
          ...motion,
        },
      };
    }
    case "clearStartFrame": {
      if (!state.domain.startFrame) return state;
      const motion = reconcileMotionAfterStartFrame(state, null);
      return {
        ...state,
        domain: {
          ...state.domain,
          startFrame: null,
          ...motion,
        },
      };
    }
    case "clearEndFrame": {
      if (!state.domain.endFrame) return state;
      return {
        ...state,
        domain: {
          ...state.domain,
          endFrame: null,
        },
      };
    }
    case "updateVideoReferenceType": {
      const { id, referenceType } = action.value;
      let hasChanges = false;
      const next = state.domain.videoReferenceImages.map((reference) => {
        if (reference.id !== id) return reference;
        if (reference.referenceType === referenceType) return reference;
        hasChanges = true;
        return { ...reference, referenceType };
      });
      if (!hasChanges) return state;
      return {
        ...state,
        domain: {
          ...state.domain,
          videoReferenceImages: next,
        },
      };
    }
    case "clearVideoReferences": {
      if (state.domain.videoReferenceImages.length === 0) return state;
      return {
        ...state,
        domain: {
          ...state.domain,
          videoReferenceImages: [],
        },
      };
    }
    case "setExtendVideo": {
      const next = action.value;
      const current = state.domain.extendVideo;
      const isSame =
        current === next ||
        (Boolean(current) === Boolean(next) &&
          current?.url === next?.url &&
          current?.source === next?.source &&
          current?.generationId === next?.generationId &&
          current?.storagePath === next?.storagePath &&
          current?.assetId === next?.assetId);
      if (isSame) return state;
      return {
        ...state,
        domain: {
          ...state.domain,
          extendVideo: next,
          ...(next
            ? {
                startFrame: null,
                endFrame: null,
                cameraMotion: null,
                subjectMotion: "",
              }
            : {}),
        },
      };
    }
    case "clearExtendVideo": {
      if (!state.domain.extendVideo) return state;
      return {
        ...state,
        domain: {
          ...state.domain,
          extendVideo: null,
        },
      };
    }
    case "setKeyframes": {
      const nextKeyframes = normalizeKeyframes(action.value);
      if (areKeyframesEqual(state.domain.keyframes, nextKeyframes))
        return state;
      return {
        ...state,
        domain: {
          ...state.domain,
          keyframes: nextKeyframes,
        },
      };
    }
    case "addKeyframe": {
      if (state.domain.keyframes.length >= MAX_KEYFRAMES) return state;
      const nextKeyframes = [
        ...state.domain.keyframes,
        { id: createKeyframeId(), ...action.value },
      ];
      return {
        ...state,
        domain: {
          ...state.domain,
          keyframes: nextKeyframes,
        },
      };
    }
    case "clearKeyframes": {
      if (state.domain.keyframes.length === 0) return state;
      return {
        ...state,
        domain: {
          ...state.domain,
          keyframes: [],
        },
      };
    }
    case "setCameraMotion":
      if (state.domain.cameraMotion?.id === action.value?.id) return state;
      return {
        ...state,
        domain: { ...state.domain, cameraMotion: action.value },
      };
    case "setSubjectMotion":
      if (state.domain.subjectMotion === action.value) return state;
      return {
        ...state,
        domain: { ...state.domain, subjectMotion: action.value },
      };
    case "resetState":
      return action.value;
    default:
      return state;
  }
};

export function GenerationControlsStoreProvider({
  children,
  initialState,
}: {
  children: React.ReactNode;
  initialState?: GenerationControlsState;
}): React.ReactElement {
  const [state, dispatch] = useReducer(
    reducer,
    initialState ?? DEFAULT_GENERATION_CONTROLS_STATE,
    (seed) => (initialState ? seed : loadGenerationControlsStoreState()),
  );

  // Throttled persistence: only write to localStorage after 2s of inactivity.
  // The reference check skips writes when the reducer returns the same object
  // (no-op dispatches); for real state changes the debounce is the main optimization.
  const lastPersistedRef = useRef<GenerationControlsState | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedPersist = useCallback(
    debounce((next: GenerationControlsState) => {
      const prev = lastPersistedRef.current;
      if (prev !== null && prev.domain === next.domain && prev.ui === next.ui) {
        return;
      }
      lastPersistedRef.current = next;
      persistGenerationControlsStoreState(next);
    }, 2_000),
    [],
  );

  useEffect(() => {
    debouncedPersist(state);
  }, [state, debouncedPersist]);

  // Flush on unmount to prevent data loss
  useEffect(() => {
    return () => {
      debouncedPersist.flush();
    };
  }, [debouncedPersist]);

  const actions = useMemo<GenerationControlsActions>(
    () => ({
      setSelectedModel: (value) =>
        dispatch({ type: "setSelectedModel", value }),
      setGenerationParams: (value) =>
        dispatch({ type: "setGenerationParams", value }),
      mergeGenerationParams: (value) =>
        dispatch({ type: "mergeGenerationParams", value }),
      setVideoTier: (value) => dispatch({ type: "setVideoTier", value }),
      setStartFrame: (value) => dispatch({ type: "setStartFrame", value }),
      clearStartFrame: () => dispatch({ type: "clearStartFrame" }),
      clearEndFrame: () => dispatch({ type: "clearEndFrame" }),
      updateVideoReferenceType: (id, referenceType) =>
        dispatch({
          type: "updateVideoReferenceType",
          value: { id, referenceType },
        }),
      clearVideoReferences: () => dispatch({ type: "clearVideoReferences" }),
      setExtendVideo: (value) => dispatch({ type: "setExtendVideo", value }),
      clearExtendVideo: () => dispatch({ type: "clearExtendVideo" }),
      setKeyframes: (value) => dispatch({ type: "setKeyframes", value }),
      addKeyframe: (value) => dispatch({ type: "addKeyframe", value }),
      clearKeyframes: () => dispatch({ type: "clearKeyframes" }),
      setCameraMotion: (value) => dispatch({ type: "setCameraMotion", value }),
      setSubjectMotion: (value) =>
        dispatch({ type: "setSubjectMotion", value }),
      resetState: (value) => dispatch({ type: "resetState", value }),
    }),
    [],
  );

  return (
    <GenerationControlsStateContext.Provider value={state}>
      <GenerationControlsActionsContext.Provider value={actions}>
        {children}
      </GenerationControlsActionsContext.Provider>
    </GenerationControlsStateContext.Provider>
  );
}

export function useGenerationControlsStoreState(): GenerationControlsState {
  const context = useContext(GenerationControlsStateContext);
  if (!context) {
    throw new Error(
      "useGenerationControlsStoreState must be used within GenerationControlsStoreProvider",
    );
  }
  return context;
}

export function useGenerationControlsStoreActions(): GenerationControlsActions {
  const context = useContext(GenerationControlsActionsContext);
  if (!context) {
    throw new Error(
      "useGenerationControlsStoreActions must be used within GenerationControlsStoreProvider",
    );
  }
  return context;
}

export function useGenerationControlsStore(): {
  state: GenerationControlsState;
  actions: GenerationControlsActions;
} {
  return {
    state: useGenerationControlsStoreState(),
    actions: useGenerationControlsStoreActions(),
  };
}
