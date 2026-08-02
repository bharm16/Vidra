/**
 * CameraMotionOption Component
 *
 * Individual camera motion option with Three.js preview on hover (normal mode)
 * or text description (fallback mode).
 *
 * Features:
 * - Normal mode: Three.js preview with lazy render on hover
 * - Fallback mode: text description from CAMERA_MOTION_DESCRIPTIONS
 * - Loading spinner during frame rendering
 * - Selected state indicator
 * - Keyboard focus support
 *
 * @requirement 6.4 - Play preview animation on hover
 * @requirement 6.5 - Render camera path previews lazily on hover
 * @requirement 12.5-12.6 - Keyboard navigation with visible focus indicators
 */

import React, { useReducer, useCallback, useRef, useEffect } from "react";
import { Check, Loader2 } from "@promptstudio/system/components/ui";
import { logger } from "@/services/LoggingService";
import { cn } from "@/utils/cn";
import {
  buildProxyUrl,
  renderCameraMotionFrames,
} from "@/features/convergence/utils/cameraMotionRenderer";
import type { CameraPath } from "@/features/convergence/types";
import { sanitizeError } from "@/utils/logging";
import { safeUrlHost } from "@/utils/url";
import { FrameAnimator } from "../shared/FrameAnimator";

// ============================================================================
// Constants
// ============================================================================

/**
 * Text descriptions for camera motions used in fallback mode
 * When depth estimation fails, these descriptions help users understand each motion
 */
export const CAMERA_MOTION_DESCRIPTIONS: Record<string, string> = {
  static: "Camera remains fixed. Best for dialogue or contemplative scenes.",
  pan_left: "Camera rotates left while staying in place. Reveals new elements.",
  pan_right:
    "Camera rotates right while staying in place. Reveals new elements.",
  tilt_up: "Camera tilts upward. Reveals height or creates awe.",
  tilt_down: "Camera tilts downward. Creates introspection or reveals ground.",
  dutch_left: "Camera rolls left for tilted horizon. Adds tension or unease.",
  dutch_right: "Camera rolls right for tilted horizon. Adds tension or unease.",
  push_in: "Camera moves toward subject. Creates intimacy or tension.",
  pull_back:
    "Camera moves away from subject. Reveals context or creates distance.",
  track_left: "Camera slides left. Follows action or reveals scene laterally.",
  track_right:
    "Camera slides right. Follows action or reveals scene laterally.",
  pedestal_up: "Camera rises vertically. Reveals overhead perspective.",
  pedestal_down: "Camera lowers vertically. Grounds the viewer.",
  crane_up: "Camera rises with subtle tilt. Creates grandeur.",
  crane_down: "Camera descends with subtle tilt. Creates intimacy.",
  arc_left: "Camera orbits left around subject. Dynamic perspective shift.",
  arc_right: "Camera orbits right around subject. Dynamic perspective shift.",
  reveal: "Combined push and pan. Builds anticipation for dramatic reveal.",
};

// ============================================================================
// Types
// ============================================================================

export interface CameraMotionOptionProps {
  /** Camera path configuration */
  cameraPath: CameraPath;
  /** Source image URL for Three.js rendering */
  imageUrl: string;
  /** Depth map URL for Three.js rendering (null in fallback mode) */
  depthMapUrl: string | null;
  /** Whether this option is currently selected */
  isSelected?: boolean;
  /** Whether this option is currently focused (keyboard navigation) */
  isFocused?: boolean;
  /** Whether the component is in fallback mode (no depth map) */
  fallbackMode?: boolean;
  /** Whether the option is disabled */
  disabled?: boolean;
  /** Callback when the option is selected */
  onSelect?: (id: string) => void;
  /** Additional CSS classes */
  className?: string;
  /** Tab index for keyboard navigation */
  tabIndex?: number;
  /** DOM id for aria-activedescendant wiring */
  optionId?: string;
}

type RenderStatus = "idle" | "rendering" | "ready" | "error";
type PreviewInteraction = "idle" | "hovering" | "press-previewing";

interface CameraMotionOptionState {
  frames: string[];
  renderStatus: RenderStatus;
  interaction: PreviewInteraction;
  prefersReducedMotion: boolean;
  isTouchDevice: boolean;
}

type CameraMotionOptionAction =
  | { type: "SET_PREFERS_REDUCED_MOTION"; prefersReducedMotion: boolean }
  | { type: "SET_TOUCH_DEVICE"; isTouchDevice: boolean }
  | { type: "SET_INTERACTION"; interaction: PreviewInteraction }
  | { type: "RENDER_START" }
  | { type: "RENDER_SUCCESS"; frames: string[] }
  | { type: "RENDER_ERROR" };

const createInitialState = (): CameraMotionOptionState => ({
  frames: [],
  renderStatus: "idle",
  interaction: "idle",
  prefersReducedMotion: false,
  isTouchDevice: false,
});

function cameraMotionOptionReducer(
  state: CameraMotionOptionState,
  action: CameraMotionOptionAction,
): CameraMotionOptionState {
  switch (action.type) {
    case "SET_PREFERS_REDUCED_MOTION":
      return {
        ...state,
        prefersReducedMotion: action.prefersReducedMotion,
      };
    case "SET_TOUCH_DEVICE":
      return {
        ...state,
        isTouchDevice: action.isTouchDevice,
      };
    case "SET_INTERACTION":
      return {
        ...state,
        interaction: action.interaction,
      };
    case "RENDER_START":
      return {
        ...state,
        renderStatus: "rendering",
      };
    case "RENDER_SUCCESS":
      return {
        ...state,
        frames: action.frames,
        renderStatus: "ready",
      };
    case "RENDER_ERROR":
      return {
        ...state,
        renderStatus: "error",
      };
    default:
      return state;
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * CameraMotionOption - Individual camera motion option with preview
 *
 * In normal mode, renders Three.js preview on hover.
 * In fallback mode, shows text description.
 */
const log = logger.child("CameraMotionOption");
const OPERATION = "renderPreviewFrames";

export const CameraMotionOption: React.FC<CameraMotionOptionProps> = ({
  cameraPath,
  imageUrl,
  depthMapUrl,
  isSelected = false,
  isFocused = false,
  fallbackMode = false,
  disabled = false,
  onSelect,
  className,
  tabIndex = 0,
  optionId,
}) => {
  const [state, dispatch] = useReducer(
    cameraMotionOptionReducer,
    undefined,
    createInitialState,
  );

  // Ref to track if component is mounted
  const isMountedRef = useRef(true);
  const renderAttemptRef = useRef(0);
  const lastSkipReasonRef = useRef<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const imageUrlHost = safeUrlHost(imageUrl);
  const depthMapUrlHost = safeUrlHost(depthMapUrl);
  const {
    frames,
    renderStatus,
    interaction,
    prefersReducedMotion,
    isTouchDevice,
  } = state;
  const isRendering = renderStatus === "rendering";
  const hasRendered = renderStatus === "ready";
  const renderError = renderStatus === "error";
  const isHovering = interaction === "hovering";
  const isPressPreviewing = interaction === "press-previewing";

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () =>
      dispatch({
        type: "SET_PREFERS_REDUCED_MOTION",
        prefersReducedMotion: mediaQuery.matches,
      });
    updateMotionPreference();

    mediaQuery.addEventListener("change", updateMotionPreference);

    return () => {
      mediaQuery.removeEventListener("change", updateMotionPreference);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hoverQuery = window.matchMedia("(hover: hover)");
    const coarseQuery = window.matchMedia("(pointer: coarse)");
    const updateTouchCapability = () => {
      const canHover = hoverQuery.matches;
      const coarsePointer = coarseQuery.matches;
      const hasTouchPoints =
        typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
      dispatch({
        type: "SET_TOUCH_DEVICE",
        isTouchDevice: !canHover && (coarsePointer || hasTouchPoints),
      });
    };
    updateTouchCapability();

    hoverQuery.addEventListener("change", updateTouchCapability);
    coarseQuery.addEventListener("change", updateTouchCapability);

    return () => {
      hoverQuery.removeEventListener("change", updateTouchCapability);
      coarseQuery.removeEventListener("change", updateTouchCapability);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  /**
   * Render frames lazily on hover (Task 23.2.1)
   * Requirement 6.5: Render camera path previews lazily on hover
   */
  const renderFrames = useCallback(async () => {
    let skipReason: string | null = null;
    if (hasRendered) {
      skipReason = "already-rendered";
    } else if (isRendering) {
      skipReason = "render-in-progress";
    } else if (fallbackMode) {
      skipReason = "fallback-mode";
    } else if (!depthMapUrl) {
      skipReason = "no-depth-map";
    }

    if (skipReason) {
      if (lastSkipReasonRef.current !== skipReason) {
        lastSkipReasonRef.current = skipReason;
        log.debug("Skipping camera motion preview render", {
          operation: OPERATION,
          cameraMotionId: cameraPath.id,
          label: cameraPath.label,
          category: cameraPath.category,
          skipReason,
          hasRendered,
          isRendering,
          fallbackMode,
          hasDepthMap: Boolean(depthMapUrl),
        });
      }
      return;
    }

    lastSkipReasonRef.current = null;
    const resolvedDepthMapUrl = depthMapUrl;
    if (!resolvedDepthMapUrl) {
      // Type guard for TypeScript; no-depth-map is already handled above.
      return;
    }
    const startedAt = Date.now();
    renderAttemptRef.current += 1;
    const renderAttempt = renderAttemptRef.current;

    log.info("Rendering camera motion preview frames", {
      operation: OPERATION,
      renderAttempt,
      cameraMotionId: cameraPath.id,
      label: cameraPath.label,
      category: cameraPath.category,
      imageUrlHost,
      depthMapUrlHost,
      durationSec: cameraPath.duration,
    });

    dispatch({ type: "RENDER_START" });

    try {
      const renderedFrames = await renderCameraMotionFrames(
        imageUrl,
        resolvedDepthMapUrl,
        cameraPath,
        {
          width: 320,
          height: 180,
          fps: 15,
        },
      );

      if (isMountedRef.current) {
        dispatch({ type: "RENDER_SUCCESS", frames: renderedFrames });
      }
      log.info("Camera motion preview frames rendered", {
        operation: OPERATION,
        renderAttempt,
        cameraMotionId: cameraPath.id,
        category: cameraPath.category,
        framesCount: renderedFrames.length,
        durationMs: Date.now() - startedAt,
        imageUrlHost,
        depthMapUrlHost,
      });
    } catch (error) {
      const info = sanitizeError(error);
      const errObj = error instanceof Error ? error : new Error(info.message);
      log.error("Camera motion preview render failed", errObj, {
        operation: OPERATION,
        renderAttempt,
        cameraMotionId: cameraPath.id,
        category: cameraPath.category,
        durationMs: Date.now() - startedAt,
        imageUrlHost,
        depthMapUrlHost,
        error: info.message,
        errorName: info.name,
      });
      if (isMountedRef.current) {
        dispatch({ type: "RENDER_ERROR" });
      }
    } finally {
      // render status is already finalized by success or error reducers
    }
  }, [
    cameraPath,
    depthMapUrl,
    depthMapUrlHost,
    fallbackMode,
    hasRendered,
    imageUrl,
    imageUrlHost,
    isRendering,
  ]);

  /**
   * Handle mouse enter - trigger lazy render
   */
  const handleMouseEnter = useCallback(() => {
    if (prefersReducedMotion || isTouchDevice) {
      return;
    }
    dispatch({ type: "SET_INTERACTION", interaction: "hovering" });
    if (!fallbackMode && !hasRendered && !isRendering) {
      log.debug("Triggering camera motion preview render on hover", {
        cameraMotionId: cameraPath.id,
        hasRendered,
        isRendering,
        fallbackMode,
      });
      renderFrames();
    }
  }, [
    cameraPath.id,
    fallbackMode,
    hasRendered,
    isRendering,
    prefersReducedMotion,
    isTouchDevice,
    renderFrames,
  ]);

  /**
   * Handle mouse leave
   */
  const handleMouseLeave = useCallback(() => {
    dispatch({ type: "SET_INTERACTION", interaction: "idle" });
  }, []);

  /**
   * Handle focus - also trigger lazy render for keyboard navigation
   */
  const handleFocus = useCallback(() => {
    if (!fallbackMode && !hasRendered && !isRendering) {
      log.debug("Triggering camera motion preview render on focus", {
        cameraMotionId: cameraPath.id,
        hasRendered,
        isRendering,
        fallbackMode,
      });
      renderFrames();
    }
  }, [cameraPath.id, fallbackMode, hasRendered, isRendering, renderFrames]);

  const startPressPreview = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || fallbackMode) {
        return;
      }

      const pointerType = event.pointerType;
      const allowLongPress = pointerType === "touch" || prefersReducedMotion;
      if (!allowLongPress) {
        return;
      }

      suppressClickRef.current = false;
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
      }

      longPressTimerRef.current = window.setTimeout(() => {
        suppressClickRef.current = true;
        dispatch({ type: "SET_INTERACTION", interaction: "press-previewing" });
        if (!hasRendered && !isRendering) {
          renderFrames();
        }
      }, 300);
    },
    [
      disabled,
      fallbackMode,
      hasRendered,
      isRendering,
      prefersReducedMotion,
      renderFrames,
    ],
  );

  const stopPressPreview = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (isPressPreviewing) {
      dispatch({ type: "SET_INTERACTION", interaction: "idle" });
    }
  }, [isPressPreviewing]);

  /**
   * Handle click selection
   */
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (disabled) {
        log.warn("Camera motion option click blocked", {
          cameraMotionId: cameraPath.id,
          label: cameraPath.label,
          category: cameraPath.category,
          disabled,
        });
        return;
      }
      log.info("Camera motion option clicked", {
        cameraMotionId: cameraPath.id,
        label: cameraPath.label,
        category: cameraPath.category,
      });
      onSelect?.(cameraPath.id);
    },
    [cameraPath.category, cameraPath.id, cameraPath.label, disabled, onSelect],
  );

  /**
   * Handle keyboard selection
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") {
        return;
      }
      if (disabled) {
        log.warn("Camera motion option keyboard selection blocked", {
          cameraMotionId: cameraPath.id,
          label: cameraPath.label,
          category: cameraPath.category,
          disabled,
          key: e.key,
        });
        return;
      }
      e.preventDefault();
      log.info("Camera motion option selected via keyboard", {
        cameraMotionId: cameraPath.id,
        label: cameraPath.label,
        category: cameraPath.category,
        key: e.key,
      });
      onSelect?.(cameraPath.id);
    },
    [cameraPath.category, cameraPath.id, cameraPath.label, disabled, onSelect],
  );

  // Determine if we should show the animation
  const allowHoverPreview = !prefersReducedMotion && !isTouchDevice;
  const showAnimation =
    !fallbackMode &&
    hasRendered &&
    frames.length > 0 &&
    ((allowHoverPreview && isHovering) || isPressPreviewing);
  const showFallbackText = fallbackMode || renderError;
  const staticPreviewFrame = frames[0] ?? null;
  const showPreviewHint =
    !showFallbackText &&
    !showAnimation &&
    (prefersReducedMotion || isTouchDevice);
  const staticImageSrc = buildProxyUrl(staticPreviewFrame ?? imageUrl);
  const previewHintText = isTouchDevice
    ? "Tap and hold to play"
    : "Press and hold to play";

  // Touch-friendly tap targets: min 44px (Task 35.4)
  // Camera motion options are naturally larger than 44px due to aspect-video
  const minTouchTarget = "min-h-[44px] min-w-[44px]";

  return (
    <button
      type="button"
      role="option"
      id={optionId}
      aria-selected={isSelected}
      aria-label={`${cameraPath.label}${isSelected ? " (selected)" : ""}`}
      tabIndex={tabIndex}
      disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onPointerDown={startPressPreview}
      onPointerUp={stopPressPreview}
      onPointerLeave={stopPressPreview}
      onPointerCancel={stopPressPreview}
      className={cn(
        "group relative overflow-hidden rounded-lg border-2 transition-all duration-200",
        "aspect-video",
        minTouchTarget,
        // Base state
        "bg-surface-2 border-border",
        // Hover state
        !disabled && !isSelected && "hover:border-primary/50 hover:shadow-md",
        // Focus state (keyboard navigation) - Requirement 36.2
        isFocused &&
          "ring-2 ring-blue-500 ring-offset-2 ring-offset-background",
        // Selected state (Task 23.4)
        isSelected && "border-primary ring-2 ring-primary/30",
        // Disabled state
        disabled && "opacity-50 cursor-not-allowed",
        // Cursor
        !disabled && "cursor-pointer",
        className,
      )}
    >
      {/* Preview Content */}
      <div className="absolute inset-0">
        {/* Normal mode: Three.js preview (Task 23.2.1) */}
        {!showFallbackText && (
          <>
            {/* Static image when not hovering or not yet rendered */}
            {!showAnimation && (
              <img
                src={staticImageSrc}
                alt={cameraPath.label}
                className="h-full w-full object-cover"
              />
            )}

            {/* Animated preview on hover */}
            {showAnimation && (
              <FrameAnimator
                frames={frames}
                fps={15}
                autoPlay={true}
                loop={true}
                alt={`${cameraPath.label} camera motion preview`}
                className="h-full w-full object-cover"
              />
            )}

            {/* Loading spinner during frame rendering (Task 23.3) */}
            {isRendering && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            )}

            {showPreviewHint && (
              <div className="absolute left-2 top-2 flex flex-col items-start gap-1 text-meta text-white/90">
                <span className="px-2 py-0.5 rounded-full bg-black/50">
                  Preview available
                </span>
                <span className="px-2 py-0.5 rounded-full bg-black/40 text-meta">
                  {previewHintText}
                </span>
              </div>
            )}
          </>
        )}

        {/* Fallback mode: text description (Task 23.2.2) */}
        {showFallbackText && (
          <div className="relative flex h-full w-full flex-col items-center justify-center p-4 text-center overflow-hidden">
            <div
              className={cn(
                "absolute inset-0",
                "bg-gradient-to-br from-surface-2 via-surface-1/70 to-raise/80",
              )}
              aria-hidden="true"
            />
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 60%)",
              }}
              aria-hidden="true"
            />
            <div className="relative z-10">
              <div className="text-lg font-medium text-foreground mb-2">
                {cameraPath.label}
              </div>
              <div className="text-sm text-muted line-clamp-3">
                {CAMERA_MOTION_DESCRIPTIONS[cameraPath.id] ||
                  "Camera motion preview"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Label overlay (only in normal mode) */}
      {!showFallbackText && (
        <div
          className={cn(
            "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-3 pt-8",
            "transition-opacity duration-200",
          )}
        >
          <span className="text-sm font-medium text-white drop-shadow-sm">
            {cameraPath.label}
          </span>
        </div>
      )}

      {/* Selected indicator (Task 23.4) */}
      {isSelected && (
        <div
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md"
          aria-hidden="true"
        >
          <Check className="h-4 w-4" strokeWidth={3} />
        </div>
      )}

      {/* Hover overlay */}
      {!disabled && !isSelected && (
        <div
          className="absolute inset-0 bg-primary/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          aria-hidden="true"
        />
      )}
    </button>
  );
};

CameraMotionOption.displayName = "CameraMotionOption";

export default CameraMotionOption;
