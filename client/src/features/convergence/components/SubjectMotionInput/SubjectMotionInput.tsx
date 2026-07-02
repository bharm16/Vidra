/**
 * SubjectMotionInput Component
 *
 * Allows users to describe how the subject moves in the video.
 * This step is optional - users can skip to finalization without entering motion.
 *
 * Features:
 * - Text input for motion description
 * - Generate Preview button with 5 credit cost display
 * - Skip button to proceed without preview
 * - Video player for preview display when available
 * - Back button to return to camera motion selection
 * - Step credit badge showing cost
 *
 * @requirement 7.1 - Subject motion step is OPTIONAL
 * @requirement 7.2 - Generate Wan 2.2 preview video on submit
 * @requirement 7.4 - Display generated preview video
 * @requirement 7.7 - Allow skipping subject motion
 */

import React, { useState, useCallback } from "react";
import { cn } from "@/utils/cn";
import {
  Play,
  SkipForward,
  Loader2,
  Coins,
  Sparkles,
  Image as ImageIcon,
} from "@promptstudio/system/components/ui";
import { BackButton, StepCreditBadge } from "../shared";

// ============================================================================
// Constants
// ============================================================================

/**
 * Credit cost for generating subject motion preview (Wan 2.2)
 */
const PREVIEW_CREDIT_COST = 5;

/**
 * Placeholder text for the motion input
 */
const PLACEHOLDER_TEXT =
  'Describe how your subject moves... (e.g., "The cat slowly walks forward, then turns its head to look at the camera")';

/**
 * Example motion descriptions to help users
 */
const EXAMPLE_MOTIONS = [
  "The subject slowly walks forward",
  "Camera follows as they turn around",
  "Gentle swaying motion in the wind",
  "Quick movement from left to right",
];

// ============================================================================
// Types
// ============================================================================

export interface SubjectMotionInputProps {
  /** Current subject motion text */
  subjectMotion: string;
  /** Generated preview video URL (if available) */
  previewVideoUrl?: string | null;
  /** Mode used for preview generation (i2v or t2v) */
  inputMode?: "i2v" | "t2v" | null;
  /** Starting frame URL used for i2v previews */
  startImageUrl?: string | null;
  /** Whether the component is in loading state (generating preview) */
  isLoading?: boolean;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Callback when subject motion text changes */
  onMotionChange?: (motion: string) => void;
  /** Callback when generate preview is clicked */
  onGeneratePreview?: () => void;
  /** Callback when skip is clicked */
  onSkip?: () => void;
  /** Callback when back is clicked */
  onBack?: () => void;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * SubjectMotionInput - Input for describing subject motion with preview generation
 *
 * @example
 * ```tsx
 * <SubjectMotionInput
 *   subjectMotion={state.subjectMotion}
 *   previewVideoUrl={state.subjectMotionVideoUrl}
 *   isLoading={state.loadingOperation === 'videoPreview'}
 *   onMotionChange={(motion) => actions.setSubjectMotion(motion)}
 *   onGeneratePreview={() => actions.generateSubjectMotionPreview()}
 *   onSkip={() => actions.skipSubjectMotion()}
 *   onBack={() => actions.goBack()}
 * />
 * ```
 */
export const SubjectMotionInput: React.FC<SubjectMotionInputProps> = ({
  subjectMotion,
  previewVideoUrl,
  inputMode = null,
  startImageUrl = null,
  isLoading = false,
  disabled = false,
  error,
  onMotionChange,
  onGeneratePreview,
  onSkip,
  onBack,
  className,
}) => {
  // Local state for textarea focus
  const [isFocused, setIsFocused] = useState(false);
  const resolvedInputMode = inputMode ?? (startImageUrl ? "i2v" : null);

  /**
   * Handle text input change
   */
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (onMotionChange) {
        onMotionChange(e.target.value);
      }
    },
    [onMotionChange],
  );

  /**
   * Handle example click - populate the input with the example
   */
  const handleExampleClick = useCallback(
    (example: string) => {
      if (onMotionChange && !disabled && !isLoading) {
        onMotionChange(example);
      }
    },
    [onMotionChange, disabled, isLoading],
  );

  /**
   * Handle generate preview click
   */
  const handleGeneratePreview = useCallback(() => {
    if (onGeneratePreview && !disabled && !isLoading && subjectMotion.trim()) {
      onGeneratePreview();
    }
  }, [onGeneratePreview, disabled, isLoading, subjectMotion]);

  /**
   * Handle skip click
   */
  const handleSkip = useCallback(() => {
    if (onSkip && !disabled && !isLoading) {
      onSkip();
    }
  }, [onSkip, disabled, isLoading]);

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl/Cmd + Enter to generate preview
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "Enter" &&
        subjectMotion.trim()
      ) {
        e.preventDefault();
        handleGeneratePreview();
      }
    },
    [handleGeneratePreview, subjectMotion],
  );

  const isDisabled = disabled || isLoading;
  const canGeneratePreview = subjectMotion.trim().length > 0 && !isDisabled;

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
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Describe Subject Motion
            </h2>
            <p className="text-sm text-muted">
              Optional: Describe how your subject moves in the video
            </p>
          </div>
        </div>

        {/* Step Credit Badge (Task 24.6) */}
        <StepCreditBadge step="subject_motion" size="md" showLabel={true} />
      </div>

      {resolvedInputMode && (
        <div className="mb-6 rounded-lg border border-border bg-surface-2 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-surface-1 border border-border">
                <ImageIcon
                  className="w-5 h-5 text-primary"
                  aria-hidden="true"
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {resolvedInputMode === "i2v"
                    ? "Using your starting frame"
                    : "Text-only preview"}
                </p>
                <p className="text-xs text-muted">
                  {resolvedInputMode === "i2v"
                    ? "The preview keeps your visual style locked to the frame."
                    : "The preview is generated from the prompt alone."}
                </p>
              </div>
            </div>
            {resolvedInputMode === "i2v" && startImageUrl && (
              <div className="flex items-center gap-3">
                <div className="w-24 h-16 rounded-md overflow-hidden border border-border bg-surface-1">
                  <img
                    src={startImageUrl}
                    alt="Starting frame"
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-xs text-muted">Starting frame</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Text Input Section (Task 24.1) */}
      <div className="mb-6">
        <div
          className={cn(
            "relative rounded-lg border transition-all duration-200",
            isFocused
              ? "border-ghost ring-2 ring-ghost/20"
              : "border-tool-border-dark hover:border-ghost/40",
            isDisabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <textarea
            value={subjectMotion}
            onChange={handleChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={PLACEHOLDER_TEXT}
            disabled={isDisabled}
            rows={4}
            className={cn(
              "w-full px-4 py-3 bg-transparent text-foreground placeholder:text-muted",
              "resize-none",
              "text-base leading-relaxed",
              isDisabled && "cursor-not-allowed",
            )}
            aria-label="Subject motion description"
            aria-describedby="motion-hint"
          />
        </div>

        {/* Character count and hint */}
        <div className="flex items-center justify-between mt-2 text-xs text-muted">
          <span id="motion-hint">
            Press{" "}
            <kbd className="px-1 py-0.5 bg-surface-2 rounded font-mono">
              Ctrl+Enter
            </kbd>{" "}
            to generate preview
          </span>
          <span>{subjectMotion.length} characters</span>
        </div>
      </div>

      {/* Example Motions */}
      {!previewVideoUrl && (
        <div className="mb-6">
          <p className="text-sm text-muted mb-2">Try an example:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_MOTIONS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => handleExampleClick(example)}
                disabled={isDisabled}
                className={cn(
                  // Touch-friendly tap targets: min 44px height (Task 35.4)
                  "px-4 py-2.5 min-h-[44px] text-sm rounded-full",
                  "bg-surface-1 border border-border text-foreground",
                  "transition-all duration-200",
                  !isDisabled && "hover:bg-surface-2 hover:border-primary/30",
                  isDisabled && "opacity-50 cursor-not-allowed",
                )}
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Video Preview Section (Task 24.4) */}
      {previewVideoUrl && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-foreground mb-3">Preview</h3>
          <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
            <video
              src={previewVideoUrl}
              controls
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-contain"
              aria-label="Subject motion preview video"
            >
              Your browser does not support the video tag.
            </video>
          </div>
          <p className="text-xs text-muted mt-2 text-center">
            Preview generated successfully. Click "Continue" to proceed or
            modify your description.
          </p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div
          className="mb-6 p-4 rounded-lg bg-error/10 border border-error/20 text-error text-sm"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Back Button (Task 24.5) */}
        <BackButton
          onBack={onBack ?? undefined}
          disabled={isDisabled}
          size="md"
        />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Skip Button (Task 24.3) - Touch-friendly tap target (Task 35.4) */}
        <button
          type="button"
          onClick={handleSkip}
          disabled={isDisabled}
          className={cn(
            "inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px]",
            "rounded-lg font-medium text-sm",
            "border border-border bg-surface-1 text-foreground",
            "transition-all duration-200",
            !isDisabled && "hover:bg-surface-2 hover:border-primary/30",
            isDisabled && "opacity-50 cursor-not-allowed",
          )}
          aria-label="Skip subject motion and proceed to preview"
        >
          <SkipForward className="w-4 h-4" aria-hidden="true" />
          <span>Skip</span>
        </button>

        {/* Generate Preview Button (Task 24.2) - Touch-friendly tap target (Task 35.4) */}
        <button
          type="button"
          onClick={handleGeneratePreview}
          disabled={!canGeneratePreview}
          className={cn(
            "inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px]",
            "rounded-lg font-medium text-sm",
            "bg-primary text-primary-foreground",
            "transition-all duration-200",
            canGeneratePreview && "hover:bg-primary/90",
            !canGeneratePreview && "opacity-50 cursor-not-allowed",
          )}
          aria-label={`Generate preview for ${PREVIEW_CREDIT_COST} credits`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4" aria-hidden="true" />
              <span>Generate Preview</span>
              {/* Credit Cost Display (Task 24.2) */}
              <span
                className="inline-flex items-center gap-1 ml-1 px-2 py-0.5 rounded-full bg-white/20 text-xs"
                aria-label={`Costs ${PREVIEW_CREDIT_COST} credits`}
              >
                <Coins className="w-3 h-3" aria-hidden="true" />
                {PREVIEW_CREDIT_COST}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Continue Button (shown after preview is generated) - Touch-friendly tap target (Task 35.4) */}
      {previewVideoUrl && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleSkip}
            disabled={isDisabled}
            className={cn(
              "inline-flex items-center justify-center gap-2 px-6 py-2.5 min-h-[44px]",
              "rounded-lg font-medium text-sm",
              "bg-success text-success-foreground",
              "transition-all duration-200",
              !isDisabled && "hover:bg-success/90",
              isDisabled && "opacity-50 cursor-not-allowed",
            )}
            aria-label="Continue to preview"
          >
            <span>Continue to Preview</span>
          </button>
        </div>
      )}

      {/* Keyboard Navigation Hint */}
      {!isLoading && (
        <p className="text-xs text-muted text-center mt-6">
          Press{" "}
          <kbd className="px-1.5 py-0.5 bg-surface-2 rounded text-xs font-mono">
            Escape
          </kbd>{" "}
          to go back
        </p>
      )}
    </div>
  );
};

SubjectMotionInput.displayName = "SubjectMotionInput";

export default SubjectMotionInput;
