/**
 * ImageOption Component
 *
 * Clickable image option with hover, focus, and selected states.
 * Used in DirectionFork and DimensionSelector components.
 *
 * @requirement 12.5-12.6 - Keyboard navigation with visible focus indicators
 * @requirement 36.2 - Add visible focus indicators (ring-2 ring-blue-500)
 * @requirement 36.4 - Add ARIA labels to ImageOption
 */

import React, { useCallback, useState } from "react";
import { cn } from "@/utils/cn";
import { Check } from "@promptstudio/system/components/ui";

export interface ImageOptionProps<OptionId extends string = string> {
  /** Unique identifier for the option */
  id: OptionId;
  /** Image URL to display */
  imageUrl: string;
  /** Label for the option */
  label: string;
  /** Whether this option is currently selected */
  isSelected?: boolean;
  /** Whether this option is currently focused (keyboard navigation) */
  isFocused?: boolean;
  /** Whether the option is disabled */
  disabled?: boolean;
  /** Callback when the option is selected */
  onSelect?: ((id: OptionId) => void) | undefined;
  /** Additional CSS classes */
  className?: string;
  /** Aspect ratio of the image */
  aspectRatio?: "square" | "video" | "4:3";
  /** Index for keyboard navigation */
  tabIndex?: number;
}

/**
 * ImageOption - Clickable image with hover/focus/selected states
 */
export function ImageOption<OptionId extends string = string>({
  id,
  imageUrl,
  label,
  isSelected = false,
  isFocused = false,
  disabled = false,
  onSelect,
  className,
  aspectRatio = "square",
  tabIndex = 0,
}: ImageOptionProps<OptionId>): React.ReactElement {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleClick = useCallback(() => {
    if (!disabled && onSelect) {
      onSelect(id);
    }
  }, [disabled, id, onSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && !disabled && onSelect) {
        e.preventDefault();
        onSelect(id);
      }
    },
    [disabled, id, onSelect],
  );

  const handleImageLoad = useCallback(() => {
    setIsLoaded(true);
  }, []);

  const handleImageError = useCallback(() => {
    setHasError(true);
    setIsLoaded(true);
  }, []);

  const aspectRatioClasses: Record<string, string> = {
    square: "aspect-square",
    video: "aspect-video",
    "4:3": "aspect-[4/3]",
  };

  // Touch-friendly tap targets: min 44px (Task 35.4)
  // Images are naturally larger than 44px, but we ensure minimum dimensions
  const minTouchTarget = "min-h-[44px] min-w-[44px]";

  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      aria-label={`${label}${isSelected ? " (selected)" : ""}`}
      tabIndex={tabIndex}
      disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "group relative overflow-hidden rounded-lg border-2 transition-all duration-200",
        aspectRatioClasses[aspectRatio],
        minTouchTarget,
        // Base state
        "bg-surface-2 border-border",
        // Hover state
        !disabled && !isSelected && "hover:border-primary/50 hover:shadow-md",
        // Focus state (keyboard navigation) - Requirement 36.2
        isFocused &&
          "ring-2 ring-blue-500 ring-offset-2 ring-offset-background",
        // Selected state
        isSelected && "border-primary ring-2 ring-primary/30",
        // Disabled state
        disabled && "opacity-50 cursor-not-allowed",
        // Cursor
        !disabled && "cursor-pointer",
        className,
      )}
    >
      {/* Image */}
      {!hasError ? (
        <img
          src={imageUrl}
          alt={label}
          loading="lazy"
          onLoad={handleImageLoad}
          onError={handleImageError}
          className={cn(
            "h-full w-full object-cover transition-all duration-300",
            !isLoaded && "opacity-0",
            isLoaded && "opacity-100",
            !disabled && "group-hover:scale-105",
          )}
        />
      ) : (
        // Error fallback
        <div className="flex h-full w-full items-center justify-center bg-raise">
          <svg
            className="h-10 w-10 text-muted/50"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
      )}

      {/* Loading skeleton overlay */}
      {!isLoaded && !hasError && (
        <div
          className="absolute inset-0 animate-pulse bg-raise"
          aria-hidden="true"
        />
      )}

      {/* Label overlay */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-3 pt-8",
          "transition-opacity duration-200",
        )}
      >
        <span className="text-sm font-medium text-white drop-shadow-sm">
          {label}
        </span>
      </div>

      {/* Selected indicator */}
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
}

ImageOption.displayName = "ImageOption";

export default ImageOption;
