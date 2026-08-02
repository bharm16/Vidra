import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import type {
  ContinuitySession,
  CreateShotInput,
  ContinuityMode,
  GenerationMode,
} from "../../types";
import {
  IDENTITY_KEYFRAME_CREDIT_COST,
  STYLE_KEYFRAME_CREDIT_COST,
} from "../../constants";
import { StrengthSlider } from "../StyleReferencePanel/StrengthSlider";
import { ContinuityModeToggle } from "./ContinuityModeToggle";
import type { CapabilitiesSchema } from "@shared/capabilities";
import { useModelRegistry } from "@/hooks/useModelRegistry";
import { useCapabilityRegistry } from "@/hooks/useCapabilityRegistry";
import { toCanonicalModelId, toCapabilityModelId } from "../../utils/modelIds";

interface ShotEditorProps {
  session: ContinuitySession;
  generationMode: GenerationMode;
  onAddShot: (input: CreateShotInput) => Promise<void> | void;
}

interface CameraHintsState {
  yaw: string;
  pitch: string;
  roll: string;
  dolly: string;
}

interface ShotEditorState {
  prompt: string;
  continuityMode: ContinuityMode;
  styleStrength: number;
  styleReferenceId: string | null;
  modelId: string;
  useCharacter: boolean;
  characterAssetId: string;
  useCameraHints: boolean;
  cameraHints: CameraHintsState;
  usePreviousReference: boolean;
  isSubmitting: boolean;
}

type ShotEditorAction =
  | { type: "RESET_FOR_SESSION"; session: ContinuitySession }
  | { type: "SYNC_STYLE_REFERENCE"; styleReferenceId: string | null }
  | { type: "SET_PROMPT"; prompt: string }
  | { type: "SET_CONTINUITY_MODE"; continuityMode: ContinuityMode }
  | { type: "SET_STYLE_STRENGTH"; styleStrength: number }
  | { type: "SET_STYLE_REFERENCE_ID"; styleReferenceId: string | null }
  | { type: "SET_MODEL_ID"; modelId: string }
  | { type: "SET_USE_CHARACTER"; useCharacter: boolean }
  | { type: "SET_CHARACTER_ASSET_ID"; characterAssetId: string }
  | { type: "TOGGLE_CAMERA_HINTS" }
  | { type: "SET_CAMERA_HINT"; field: keyof CameraHintsState; value: string }
  | { type: "SET_USE_PREVIOUS_REFERENCE"; usePreviousReference: boolean }
  | { type: "SET_SUBMITTING"; isSubmitting: boolean }
  | { type: "RESET_AFTER_SUBMIT" };

const parseNumber = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getCapabilityDefault = (
  schema: CapabilitiesSchema | undefined,
  fieldId: string,
): boolean => {
  if (!schema) return false;
  const field = schema.fields[fieldId];
  return field?.default === true;
};

const createInitialState = (session: ContinuitySession): ShotEditorState => {
  const lastShot = session.shots[session.shots.length - 1];
  return {
    prompt: "",
    continuityMode: session.defaultSettings.defaultContinuityMode,
    styleStrength: session.defaultSettings.defaultStyleStrength,
    styleReferenceId: lastShot?.id ?? null,
    modelId: toCapabilityModelId(session.defaultSettings.defaultModel) || "",
    useCharacter: Boolean(session.defaultSettings.useCharacterConsistency),
    characterAssetId: "",
    useCameraHints: false,
    cameraHints: {
      yaw: "",
      pitch: "",
      roll: "",
      dolly: "",
    },
    usePreviousReference: false,
    isSubmitting: false,
  };
};

function shotEditorReducer(
  state: ShotEditorState,
  action: ShotEditorAction,
): ShotEditorState {
  switch (action.type) {
    case "RESET_FOR_SESSION":
      return createInitialState(action.session);
    case "SYNC_STYLE_REFERENCE":
      return {
        ...state,
        styleReferenceId: action.styleReferenceId,
      };
    case "SET_PROMPT":
      return {
        ...state,
        prompt: action.prompt,
      };
    case "SET_CONTINUITY_MODE":
      return {
        ...state,
        continuityMode: action.continuityMode,
      };
    case "SET_STYLE_STRENGTH":
      return {
        ...state,
        styleStrength: action.styleStrength,
      };
    case "SET_STYLE_REFERENCE_ID":
      return {
        ...state,
        styleReferenceId: action.styleReferenceId,
      };
    case "SET_MODEL_ID":
      return {
        ...state,
        modelId: action.modelId,
      };
    case "SET_USE_CHARACTER":
      return {
        ...state,
        useCharacter: action.useCharacter,
      };
    case "SET_CHARACTER_ASSET_ID":
      return {
        ...state,
        characterAssetId: action.characterAssetId,
      };
    case "TOGGLE_CAMERA_HINTS":
      return {
        ...state,
        useCameraHints: !state.useCameraHints,
      };
    case "SET_CAMERA_HINT":
      return {
        ...state,
        cameraHints: {
          ...state.cameraHints,
          [action.field]: action.value,
        },
      };
    case "SET_USE_PREVIOUS_REFERENCE":
      return {
        ...state,
        usePreviousReference: action.usePreviousReference,
      };
    case "SET_SUBMITTING":
      return {
        ...state,
        isSubmitting: action.isSubmitting,
      };
    case "RESET_AFTER_SUBMIT":
      return {
        ...state,
        prompt: "",
      };
    default:
      return state;
  }
}

export function ShotEditor({
  session,
  generationMode,
  onAddShot,
}: ShotEditorProps): React.ReactElement {
  const [state, dispatch] = useReducer(
    shotEditorReducer,
    session,
    createInitialState,
  );
  const { models: registryModels, isLoading: modelsLoading } =
    useModelRegistry();
  const {
    capabilityMap,
    hasRegistry,
    error: registryError,
  } = useCapabilityRegistry();
  const lastSessionIdRef = useRef(session.id);

  const {
    prompt,
    continuityMode,
    styleStrength,
    styleReferenceId,
    modelId,
    useCharacter,
    characterAssetId,
    useCameraHints,
    cameraHints,
    usePreviousReference,
    isSubmitting,
  } = state;

  // Reset all editor settings when a different session is loaded
  useEffect(() => {
    if (lastSessionIdRef.current === session.id) return;
    lastSessionIdRef.current = session.id;
    dispatch({ type: "RESET_FOR_SESSION", session });
  }, [session]);

  // Auto-select the latest shot as style reference when shots change
  useEffect(() => {
    const lastShot = session.shots[session.shots.length - 1];
    dispatch({
      type: "SYNC_STYLE_REFERENCE",
      styleReferenceId: lastShot?.id ?? null,
    });
  }, [session.id, session.shots, session.shots.length]);

  const styleReferenceOptions = useMemo(() => {
    const options: Array<{ label: string; value: string | null }> = [
      { label: "Primary reference", value: null },
    ];
    session.shots.forEach((shot) => {
      options.push({ label: `Shot ${shot.sequenceIndex + 1}`, value: shot.id });
    });
    return options;
  }, [session.shots]);

  const hasPreviousShot = session.shots.length > 0;
  const showContinuityControls = generationMode === "continuity";
  const requiresCharacterConsistency =
    useCharacter || session.defaultSettings.useCharacterConsistency;

  const isContinuityCapable = useCallback(
    (capabilityId: string): boolean => {
      if (!hasRegistry) return true;
      const schema = capabilityMap[capabilityId];
      if (!schema) return false;
      const supportsImage = getCapabilityDefault(schema, "image_input");
      const supportsStyle = getCapabilityDefault(schema, "style_reference");
      return supportsImage || supportsStyle;
    },
    [hasRegistry, capabilityMap],
  );

  const continuityEligibleModels = useMemo(
    () => registryModels.filter((model) => isContinuityCapable(model.id)),
    [registryModels, isContinuityCapable],
  );

  const availableModels =
    showContinuityControls && continuityEligibleModels.length
      ? continuityEligibleModels
      : registryModels;

  const selectedModelSchema = modelId ? capabilityMap[modelId] : undefined;
  const selectedSupportsImage = getCapabilityDefault(
    selectedModelSchema,
    "image_input",
  );
  const selectedSupportsStyle = getCapabilityDefault(
    selectedModelSchema,
    "style_reference",
  );
  const selectedContinuityEligible = hasRegistry
    ? Boolean(selectedSupportsImage || selectedSupportsStyle)
    : true;
  const resolvedModelId = useMemo(() => toCanonicalModelId(modelId), [modelId]);
  const modelResolvable = !modelId || Boolean(resolvedModelId);
  const canSubmitContinuity =
    !showContinuityControls || (selectedContinuityEligible && modelResolvable);

  useEffect(() => {
    if (!showContinuityControls || !continuityEligibleModels.length) return;
    if (modelId && selectedContinuityEligible) return;
    const fallback = continuityEligibleModels[0];
    if (fallback) {
      dispatch({ type: "SET_MODEL_ID", modelId: fallback.id });
    }
  }, [
    showContinuityControls,
    continuityEligibleModels,
    modelId,
    selectedContinuityEligible,
  ]);

  const overheadInfo = useMemo(() => {
    if (generationMode === "continuity" && continuityMode === "style-match") {
      return requiresCharacterConsistency
        ? { cost: IDENTITY_KEYFRAME_CREDIT_COST, label: "identity keyframe" }
        : { cost: STYLE_KEYFRAME_CREDIT_COST, label: "style keyframe" };
    }

    if (generationMode === "standard" && useCharacter && characterAssetId) {
      return {
        cost: IDENTITY_KEYFRAME_CREDIT_COST,
        label: "character keyframe",
      };
    }

    return { cost: 0, label: "" };
  }, [
    generationMode,
    continuityMode,
    requiresCharacterConsistency,
    useCharacter,
    characterAssetId,
  ]);

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    dispatch({ type: "SET_SUBMITTING", isSubmitting: true });
    try {
      const yaw = parseNumber(cameraHints.yaw);
      const pitch = parseNumber(cameraHints.pitch);
      const roll = parseNumber(cameraHints.roll);
      const dolly = parseNumber(cameraHints.dolly);
      const camera = useCameraHints
        ? {
            ...(yaw !== undefined ? { yaw } : {}),
            ...(pitch !== undefined ? { pitch } : {}),
            ...(roll !== undefined ? { roll } : {}),
            ...(dolly !== undefined ? { dolly } : {}),
          }
        : undefined;

      const canonicalModelId = toCanonicalModelId(modelId) || undefined;
      const input: CreateShotInput = {
        prompt: prompt.trim(),
        generationMode,
        continuityMode:
          generationMode === "continuity"
            ? continuityMode
            : usePreviousReference
              ? "frame-bridge"
              : "none",
        ...(showContinuityControls ? { styleStrength, styleReferenceId } : {}),
        ...(canonicalModelId ? { modelId: canonicalModelId } : {}),
        ...(useCharacter && characterAssetId ? { characterAssetId } : {}),
        ...(camera ? { camera } : {}),
      };

      await onAddShot(input);
      dispatch({ type: "RESET_AFTER_SUBMIT" });
    } finally {
      dispatch({ type: "SET_SUBMITTING", isSubmitting: false });
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Add Shot</h3>
        {showContinuityControls ? (
          <span className="text-xs text-muted">Continuity mode</span>
        ) : (
          <span className="text-xs text-muted">Standard mode</span>
        )}
      </div>

      <textarea
        value={prompt}
        onChange={(event) =>
          dispatch({ type: "SET_PROMPT", prompt: event.target.value })
        }
        className="w-full min-h-[96px] rounded-lg border border-border bg-surface-1 p-3 text-sm"
        placeholder="Describe the next shot"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-muted">Model</label>
          <select
            value={modelId || ""}
            onChange={(event) =>
              dispatch({ type: "SET_MODEL_ID", modelId: event.target.value })
            }
            className="mt-1 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm"
            disabled={modelsLoading || availableModels.length === 0}
          >
            {availableModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
          {registryError && (
            <div className="mt-1 text-meta text-warning">
              Unable to load model registry ({registryError}). Showing fallback
              models.
            </div>
          )}
          {showContinuityControls &&
            hasRegistry &&
            !selectedContinuityEligible && (
              <div className="mt-1 text-meta text-warning">
                Selected model does not support image input or native style
                reference. Choose another model for continuity.
              </div>
            )}
          {showContinuityControls && !modelResolvable && (
            <div className="mt-1 text-meta text-warning">
              Selected model is not supported for generation. Choose a supported
              model.
            </div>
          )}
          {showContinuityControls &&
            hasRegistry &&
            continuityEligibleModels.length === 0 && (
              <div className="mt-1 text-meta text-warning">
                No continuity-capable models are available. Check provider
                credentials.
              </div>
            )}
          {showContinuityControls && !hasRegistry && (
            <div className="mt-1 text-meta text-warning">
              Model capabilities unavailable; continuity eligibility will be
              enforced on the server.
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            id="use-character"
            type="checkbox"
            checked={useCharacter}
            onChange={(event) =>
              dispatch({
                type: "SET_USE_CHARACTER",
                useCharacter: event.target.checked,
              })
            }
          />
          <label htmlFor="use-character" className="text-sm text-muted">
            Use character reference
          </label>
        </div>
      </div>

      {overheadInfo.cost > 0 && (
        <div className="text-xs text-muted">
          Continuity overhead: +{overheadInfo.cost} credits (
          {overheadInfo.label})
        </div>
      )}

      {useCharacter && (
        <input
          type="text"
          value={characterAssetId}
          onChange={(event) =>
            dispatch({
              type: "SET_CHARACTER_ASSET_ID",
              characterAssetId: event.target.value,
            })
          }
          placeholder="Character asset ID"
          className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm"
        />
      )}

      {showContinuityControls ? (
        <div className="space-y-3">
          <div>
            <div className="text-xs font-medium text-muted mb-2">
              Continuity mode
            </div>
            <ContinuityModeToggle
              value={continuityMode}
              onChange={(value) =>
                dispatch({ type: "SET_CONTINUITY_MODE", continuityMode: value })
              }
            />
            {!hasPreviousShot && continuityMode === "frame-bridge" && (
              <div className="mt-2 text-xs text-warning">
                Frame bridge requires a previous generated shot.
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted">
              Style source
            </label>
            <select
              className="mt-1 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm"
              value={styleReferenceId ?? "primary"}
              onChange={(event) => {
                const value = event.target.value || "primary";
                dispatch({
                  type: "SET_STYLE_REFERENCE_ID",
                  styleReferenceId: value === "primary" ? null : value,
                });
              }}
            >
              {styleReferenceOptions.map((option) => (
                <option
                  key={option.value ?? "primary"}
                  value={option.value ?? "primary"}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {continuityMode === "style-match" && (
            <StrengthSlider
              value={styleStrength}
              onChange={(value) =>
                dispatch({ type: "SET_STYLE_STRENGTH", styleStrength: value })
              }
            />
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted">
                Camera hints (optional)
              </label>
              <button
                type="button"
                className="text-xs text-muted hover:text-foreground"
                onClick={() => dispatch({ type: "TOGGLE_CAMERA_HINTS" })}
              >
                {useCameraHints ? "Hide" : "Add"}
              </button>
            </div>
            {useCameraHints && (
              <div className="grid gap-2 sm:grid-cols-4">
                <input
                  type="number"
                  value={cameraHints.yaw}
                  onChange={(event) =>
                    dispatch({
                      type: "SET_CAMERA_HINT",
                      field: "yaw",
                      value: event.target.value,
                    })
                  }
                  placeholder="Yaw"
                  className="rounded-md border border-border bg-surface-1 px-2 py-1 text-sm"
                />
                <input
                  type="number"
                  value={cameraHints.pitch}
                  onChange={(event) =>
                    dispatch({
                      type: "SET_CAMERA_HINT",
                      field: "pitch",
                      value: event.target.value,
                    })
                  }
                  placeholder="Pitch"
                  className="rounded-md border border-border bg-surface-1 px-2 py-1 text-sm"
                />
                <input
                  type="number"
                  value={cameraHints.roll}
                  onChange={(event) =>
                    dispatch({
                      type: "SET_CAMERA_HINT",
                      field: "roll",
                      value: event.target.value,
                    })
                  }
                  placeholder="Roll"
                  className="rounded-md border border-border bg-surface-1 px-2 py-1 text-sm"
                />
                <input
                  type="number"
                  value={cameraHints.dolly}
                  onChange={(event) =>
                    dispatch({
                      type: "SET_CAMERA_HINT",
                      field: "dolly",
                      value: event.target.value,
                    })
                  }
                  placeholder="Dolly"
                  className="rounded-md border border-border bg-surface-1 px-2 py-1 text-sm"
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-3">
          <div className="text-xs text-muted">
            Standard mode allows text-to-video. You can optionally reuse the
            previous shot as a reference image.
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={usePreviousReference}
              onChange={(event) =>
                dispatch({
                  type: "SET_USE_PREVIOUS_REFERENCE",
                  usePreviousReference: event.target.checked,
                })
              }
            />
            Use previous shot as reference (best effort)
          </label>
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting || !prompt.trim() || !canSubmitContinuity}
        className={`w-full rounded-md px-4 py-2 text-sm font-medium ${
          isSubmitting || !prompt.trim() || !canSubmitContinuity
            ? "bg-raise text-muted cursor-not-allowed"
            : "bg-accent text-white"
        }`}
      >
        {isSubmitting ? "Adding..." : "Add Shot"}
      </button>
    </div>
  );
}

export default ShotEditor;
