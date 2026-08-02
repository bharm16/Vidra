/**
 * CameraMotionPicker Component
 *
 * Component for selecting camera motion in the Visual Convergence flow.
 * Displays camera motion options with Three.js previews on hover.
 *
 * Features:
 * - Grid layout: 2 columns on mobile, 3-4 columns on desktop (Task 23.1)
 * - Normal mode: Three.js preview with lazy render on hover (Task 23.2.1)
 * - Fallback mode: text description when depth estimation fails (Task 23.2.2)
 * - Loading spinner during frame rendering (Task 23.3)
 * - Selected state indicator (Task 23.4)
 * - Error boundary for Three.js errors (Task 23.5)
 * - Keyboard focus support (Task 23.7)
 *
 * @requirement 5.4 - Provide at least 6 camera path options
 * @requirement 5.5 - Offer text-only camera motion selection as fallback
 * @requirement 6.4 - Play preview animation on hover
 * @requirement 6.5 - Render camera path previews lazily on hover
 * @requirement 12.2 - Display camera options in responsive grid (2 cols mobile, 3-4 cols desktop)
 * @requirement 12.5-12.6 - Keyboard navigation support
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useId,
} from "react";
import { Video } from "@promptstudio/system/components/ui";
import { logger } from "@/services/LoggingService";
import { cn } from "@/utils/cn";
import { safeUrlHost } from "@/utils/url";
import type {
  CameraMotionCategory,
  CameraPath,
} from "@/features/convergence/types";
import { CameraMotionOption } from "./CameraMotionOption";
import { CameraMotionErrorBoundary } from "./CameraMotionErrorBoundary";
import { BackButton, StepCreditBadge } from "../shared";
const log = logger.child("CameraMotionPicker");

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_LABELS: Record<CameraMotionCategory | "all", string> = {
  all: "All",
  static: "Static",
  pan_tilt: "Pan & Tilt",
  dolly: "Dolly",
  crane: "Crane",
  orbital: "Orbital",
  compound: "Compound",
};

// ============================================================================
// Types
// ============================================================================

export interface CameraMotionPickerProps {
  /** Available camera paths to display */
  cameraPaths: CameraPath[];
  /** Source image URL for Three.js rendering */
  imageUrl: string;
  /** Depth map URL for Three.js rendering (null in fallback mode) */
  depthMapUrl: string | null;
  /** Currently selected camera motion ID */
  selectedCameraMotion?: string | null;
  /** Currently focused option index for keyboard navigation */
  focusedOptionIndex?: number;
  /** Whether the component is in fallback mode (no depth map) */
  fallbackMode?: boolean;
  /** Whether the component is in loading state */
  isLoading?: boolean;
  /** Callback when a camera motion is selected */
  onSelect?: (cameraMotionId: string) => void;
  /** Callback when back is clicked */
  onBack?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Whether selection is disabled */
  disabled?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * CameraMotionPicker - Camera motion selection component
 *
 * Displays a grid of camera motion options with Three.js previews.
 * Falls back to text descriptions when depth estimation fails.
 *
 * @example
 * ```tsx
 * <CameraMotionPicker
 *   cameraPaths={state.cameraPaths}
 *   imageUrl={lastImage.url}
 *   depthMapUrl={state.depthMapUrl}
 *   selectedCameraMotion={state.selectedCameraMotion}
 *   focusedOptionIndex={state.focusedOptionIndex}
 *   fallbackMode={state.cameraMotionFallbackMode}
 *   onSelect={(id) => actions.selectCameraMotion(id)}
 *   onBack={() => actions.goBack()}
 * />
 * ```
 */
export const CameraMotionPicker: React.FC<CameraMotionPickerProps> = ({
  cameraPaths,
  imageUrl,
  depthMapUrl,
  selectedCameraMotion,
  focusedOptionIndex = -1,
  fallbackMode = false,
  isLoading = false,
  onSelect,
  onBack,
  className,
  disabled = false,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<
    CameraMotionCategory | "all"
  >("all");
  const pickerStateRef = useRef<string | null>(null);
  const listboxId = useId();
  const imageUrlHost = safeUrlHost(imageUrl);
  const depthMapUrlHost = safeUrlHost(depthMapUrl);

  const cameraPathById = useMemo(() => {
    const map = new Map<string, CameraPath>();
    cameraPaths.forEach((path) => map.set(path.id, path));
    return map;
  }, [cameraPaths]);

  /**
   * Handle camera motion selection
   */
  const handleSelect = useCallback(
    (cameraMotionId: string) => {
      const selectedPath = cameraPathById.get(cameraMotionId);

      if (disabled || isLoading) {
        log.warn("Camera motion selection blocked in picker", {
          cameraMotionId,
          label: selectedPath?.label ?? null,
          category: selectedPath?.category ?? null,
          disabled,
          isLoading,
          fallbackMode,
        });
        return;
      }

      log.info("Camera motion selected in picker", {
        cameraMotionId,
        label: selectedPath?.label ?? null,
        category: selectedPath?.category ?? null,
        fallbackMode,
        imageUrlHost,
        depthMapUrlHost,
      });

      onSelect?.(cameraMotionId);
    },
    [
      cameraPathById,
      depthMapUrlHost,
      disabled,
      fallbackMode,
      imageUrlHost,
      isLoading,
      onSelect,
    ],
  );

  const filteredPaths = useMemo(() => {
    if (selectedCategory === "all") return cameraPaths;
    return cameraPaths.filter((path) => path.category === selectedCategory);
  }, [cameraPaths, selectedCategory]);

  const focusedCameraPathId =
    focusedOptionIndex >= 0 ? cameraPaths[focusedOptionIndex]?.id : undefined;
  const focusedCameraPathVisible = Boolean(
    focusedCameraPathId &&
      filteredPaths.some((path) => path.id === focusedCameraPathId),
  );
  const activeOptionId = focusedCameraPathVisible
    ? `${listboxId}-option-${focusedCameraPathId}`
    : undefined;
  const rovingTabIndexId =
    (focusedCameraPathVisible && focusedCameraPathId) ||
    (selectedCameraMotion &&
    filteredPaths.some((path) => path.id === selectedCameraMotion)
      ? selectedCameraMotion
      : filteredPaths[0]?.id);

  const categoryCounts = useMemo(() => {
    const counts: Record<CameraMotionCategory | "all", number> = {
      all: cameraPaths.length,
      static: 0,
      pan_tilt: 0,
      dolly: 0,
      crane: 0,
      orbital: 0,
      compound: 0,
    };

    cameraPaths.forEach((path) => {
      counts[path.category] = (counts[path.category] ?? 0) + 1;
    });

    return counts;
  }, [cameraPaths]);

  const isDisabled = disabled || isLoading;

  useEffect(() => {
    const stateKey = [
      cameraPaths.length,
      filteredPaths.length,
      fallbackMode ? "fallback" : "depth",
      depthMapUrlHost ?? "no-depth-host",
      selectedCameraMotion ?? "none",
      focusedOptionIndex,
      selectedCategory,
      isDisabled ? "disabled" : "enabled",
    ].join("|");

    if (pickerStateRef.current === stateKey) {
      return;
    }

    pickerStateRef.current = stateKey;
    log.info("Camera motion picker state updated", {
      cameraPathsCount: cameraPaths.length,
      filteredPathsCount: filteredPaths.length,
      fallbackMode,
      hasDepthMap: Boolean(depthMapUrl),
      depthMapUrlHost,
      selectedCameraMotion: selectedCameraMotion ?? null,
      focusedOptionIndex,
      selectedCategory,
      disabled: isDisabled,
      imageUrlHost,
    });
  }, [
    cameraPaths.length,
    depthMapUrl,
    depthMapUrlHost,
    fallbackMode,
    filteredPaths.length,
    focusedOptionIndex,
    imageUrlHost,
    isDisabled,
    selectedCameraMotion,
    selectedCategory,
  ]);

  const handleCategoryChange = useCallback(
    (category: CameraMotionCategory | "all") => {
      if (category === selectedCategory) {
        return;
      }
      log.info("Camera motion category changed", {
        previousCategory: selectedCategory,
        nextCategory: category,
        cameraPathsCount: cameraPaths.length,
      });
      setSelectedCategory(category);
    },
    [cameraPaths.length, selectedCategory],
  );

  return (
    <div
      className={cn("flex flex-col w-full max-w-4xl mx-auto px-4", className)}
    >
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        {/* Title with icon */}
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10"
            aria-hidden="true"
          >
            <Video className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Choose Camera Motion
            </h2>
            <p className="text-sm text-muted">
              {fallbackMode
                ? "Select how the camera moves in your video"
                : "Hover to preview camera movements"}
            </p>
          </div>
        </div>

        {/* Step Credit Badge */}
        <StepCreditBadge step="camera_motion" size="md" showLabel={true} />
      </div>

      {/* Fallback mode notice */}
      {fallbackMode && (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-sm text-amber-600 dark:text-amber-400">
            <strong>Note:</strong> Camera motion previews are unavailable.
            Please select based on the descriptions below.
          </p>
        </div>
      )}

      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() =>
              handleCategoryChange(key as CameraMotionCategory | "all")
            }
            aria-pressed={selectedCategory === key}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
              selectedCategory === key
                ? "bg-primary text-primary-foreground"
                : "bg-surface-2 text-muted hover:text-foreground",
            )}
          >
            <span>{label}</span>
            <span
              className={cn(
                "ml-2 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-meta",
                selectedCategory === key
                  ? "bg-primary-foreground/15 text-primary-foreground"
                  : "bg-raise text-muted",
              )}
            >
              {categoryCounts[key as CameraMotionCategory | "all"] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Camera Motion Grid (Task 23.1) */}
      {/* Responsive grid: 2 columns on mobile, 3-4 columns on desktop */}
      <div
        className={cn(
          "grid gap-4 mb-6",
          filteredPaths.length <= 6
            ? "grid-cols-2 md:grid-cols-3"
            : "grid-cols-2 md:grid-cols-4",
        )}
        role="listbox"
        aria-label="Camera motion options"
        aria-activedescendant={activeOptionId}
      >
        {filteredPaths.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-2/50 p-6 text-center">
            <div className="text-sm font-medium text-foreground mb-2">
              No motions in this category
            </div>
            <div className="text-xs text-muted">
              Try another category to explore more options.
            </div>
          </div>
        ) : (
          filteredPaths.map((cameraPath) => (
            <CameraMotionOption
              key={cameraPath.id}
              optionId={`${listboxId}-option-${cameraPath.id}`}
              cameraPath={cameraPath}
              imageUrl={imageUrl}
              depthMapUrl={depthMapUrl}
              isSelected={selectedCameraMotion === cameraPath.id}
              isFocused={cameraPath.id === focusedCameraPathId}
              fallbackMode={fallbackMode}
              disabled={isDisabled}
              onSelect={handleSelect}
              tabIndex={cameraPath.id === rovingTabIndexId ? 0 : -1}
            />
          ))
        )}
      </div>

      {/* Actions Section */}
      <div className="flex items-center justify-between">
        {/* Back Button */}
        <BackButton
          onBack={onBack ?? undefined}
          disabled={isDisabled}
          size="md"
        />

        {/* Empty spacer for alignment */}
        <div />
      </div>

      {/* Keyboard Navigation Hint (Task 23.7) */}
      {!isLoading && (
        <p className="text-xs text-muted text-center mt-4">
          Use{" "}
          <kbd className="px-1.5 py-0.5 bg-surface-2 rounded text-xs font-mono">
            Arrow keys
          </kbd>{" "}
          to navigate,{" "}
          <kbd className="px-1.5 py-0.5 bg-surface-2 rounded text-xs font-mono">
            Enter
          </kbd>{" "}
          to select,{" "}
          <kbd className="px-1.5 py-0.5 bg-surface-2 rounded text-xs font-mono">
            Escape
          </kbd>{" "}
          to go back
        </p>
      )}
    </div>
  );
};

CameraMotionPicker.displayName = "CameraMotionPicker";

// ============================================================================
// Wrapped Component with Error Boundary (Task 23.6)
// ============================================================================

export interface CameraMotionPickerWithErrorBoundaryProps
  extends CameraMotionPickerProps {
  /** Callback when Three.js error occurs */
  onThreeJsError?: (error: Error) => void;
}

/**
 * CameraMotionPickerWithErrorBoundary - CameraMotionPicker wrapped with error boundary
 *
 * Catches Three.js errors and falls back to text mode automatically.
 */
export const CameraMotionPickerWithErrorBoundary: React.FC<
  CameraMotionPickerWithErrorBoundaryProps
> = ({ onThreeJsError, ...props }) => {
  const [forceFallback, setForceFallback] = React.useState(false);

  const handleError = useCallback(
    (error: Error) => {
      log.error("Three.js error in CameraMotionPicker", error, {
        fallbackEnabled: true,
      });
      setForceFallback(true);
      if (onThreeJsError) {
        onThreeJsError(error);
      }
    },
    [onThreeJsError],
  );

  return (
    <CameraMotionErrorBoundary
      onError={handleError}
      fallback={<CameraMotionPicker {...props} fallbackMode={true} />}
    >
      <CameraMotionPicker
        {...props}
        fallbackMode={props.fallbackMode || forceFallback}
      />
    </CameraMotionErrorBoundary>
  );
};

CameraMotionPickerWithErrorBoundary.displayName =
  "CameraMotionPickerWithErrorBoundary";

export default CameraMotionPicker;
