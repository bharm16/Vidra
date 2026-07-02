import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, WarningCircle } from "@promptstudio/system/components/ui";
import { cn } from "@/utils/cn";
import { resolveMediaUrl } from "@/services/media/MediaUrlResolver";

interface KontextFrameStripProps {
  frames: Array<string | null>;
  duration: number;
  isGenerating: boolean;
  progressPercent?: number | null | undefined;
  onFrameClick?: ((index: number, url: string | null) => void) | undefined;
  selectedFrameUrl?: string | null | undefined;
}

export function KontextFrameStrip({
  frames,
  duration,
  isGenerating,
  progressPercent,
  onFrameClick,
  selectedFrameUrl,
}: KontextFrameStripProps): React.ReactElement {
  const [failedIndices, setFailedIndices] = useState<Set<number>>(new Set());

  const slots = useMemo(() => {
    const normalizedFrames = frames.slice(0, 4);
    if (normalizedFrames.length >= 4) {
      return normalizedFrames;
    }
    return [
      ...normalizedFrames,
      ...Array.from({ length: 4 - normalizedFrames.length }, () => null),
    ];
  }, [frames]);
  const [resolvedSlots, setResolvedSlots] =
    useState<Array<string | null>>(slots);
  const refreshAttemptedRef = useRef<Map<number, boolean>>(new Map());
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 5;
  const labels = useMemo(() => {
    const step =
      slots.length > 1 ? safeDuration / (slots.length - 1) : safeDuration;
    return slots.map((_, index) => `${(step * index).toFixed(1)}s`);
  }, [slots, safeDuration]);
  const prevSlotsRef = useRef<Array<string | null>>(slots);

  useEffect(() => {
    const prevSlots = prevSlotsRef.current;
    if (!prevSlots) {
      prevSlotsRef.current = slots;
      setResolvedSlots(slots);
      return;
    }

    const changedIndices: number[] = [];
    for (let index = 0; index < slots.length; index += 1) {
      if (slots[index] !== prevSlots[index]) {
        changedIndices.push(index);
      }
    }

    if (changedIndices.length) {
      setFailedIndices((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        changedIndices.forEach((index) => next.delete(index));
        return next;
      });
      setResolvedSlots((prev) => {
        const next = [...prev];
        changedIndices.forEach((index) => {
          next[index] = slots[index] ?? null;
          refreshAttemptedRef.current.delete(index);
        });
        return next;
      });
    }

    prevSlotsRef.current = slots;
  }, [slots]);

  const handleImageError = async (index: number) => {
    if (import.meta.env.DEV) {
      console.warn("[KontextFrameStrip] Image failed to load:", {
        index,
        url: resolvedSlots[index]?.slice(0, 100),
      });
    }
    if (refreshAttemptedRef.current.get(index)) {
      setFailedIndices((prev) => {
        const next = new Set(prev);
        next.add(index);
        return next;
      });
      return;
    }

    refreshAttemptedRef.current.set(index, true);
    const currentUrl = resolvedSlots[index];
    if (currentUrl) {
      const refreshed = await resolveMediaUrl({
        kind: "image",
        url: currentUrl,
        preferFresh: true,
      });
      if (refreshed.url && refreshed.url !== currentUrl) {
        setResolvedSlots((prev) => {
          const next = [...prev];
          next[index] = refreshed.url;
          return next;
        });
        setFailedIndices((prev) => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
        return;
      }
    }

    setFailedIndices((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  };

  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {resolvedSlots.map((frame, index) => {
        const isSelected = Boolean(
          frame && selectedFrameUrl && frame === selectedFrameUrl,
        );
        const canSelect = Boolean(frame && onFrameClick);
        const hasFailed = failedIndices.has(index);

        return (
          <button
            key={`frame-${index}-${frame ?? "empty"}`}
            type="button"
            className={cn(
              "group overflow-hidden rounded-md border bg-tool-surface-card text-left",
              isSelected
                ? "border-tool-accent-neutral ring-2 ring-tool-accent-neutral"
                : "border-tool-nav-active transition hover:border-tool-text-disabled",
            )}
            onClick={() => {
              if (!frame || hasFailed) return;
              onFrameClick?.(index, frame);
            }}
            disabled={(!frame && !isGenerating) || hasFailed}
            aria-pressed={isSelected}
          >
            <div
              className={cn(
                "relative aspect-[4/3] overflow-hidden bg-tool-surface-deep",
                isGenerating &&
                  !frame &&
                  "bg-gradient-to-r from-tool-surface-deep via-tool-surface-card to-tool-surface-deep bg-[length:200%_100%] animate-shimmer",
              )}
            >
              {isGenerating && index === 0 && (
                <div className="absolute top-2 left-2 z-10 rounded-md bg-black/40 backdrop-blur-md px-2.5 py-1 text-xs font-semibold text-amber-400">
                  {typeof progressPercent === "number"
                    ? `${progressPercent}% Complete`
                    : "Generating"}
                </div>
              )}
              {frame && !hasFailed ? (
                <img
                  src={frame}
                  alt={`Frame ${index + 1}`}
                  className={cn(
                    "h-full w-full object-cover",
                    !isGenerating && "animate-fade-in",
                  )}
                  onError={() => handleImageError(index)}
                />
              ) : hasFailed ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-tool-text-label">
                  <WarningCircle
                    size={20}
                    className="text-red-500/40"
                    aria-hidden="true"
                  />
                  <span className="text-[10px] font-medium">Failed</span>
                </div>
              ) : (
                <div className="h-full w-full bg-tool-surface-deep" />
              )}
              {canSelect && !isSelected && !hasFailed && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Use as keyframe
                </div>
              )}
              {isSelected && (
                <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-tool-accent-neutral text-white">
                  <Check size={12} weight="bold" aria-hidden="true" />
                </div>
              )}
              <div className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white">
                {labels[index]}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
