/**
 * Visual Preview Component
 *
 * Displays image previews generated from prompts using Flux models.
 *
 * Per Stage UX spec: this component is a **bare renderer**.
 * - When there's no output: render nothing (transparent)
 * - When there's output: render image(s) only
 *
 * Stage (the parent) owns framing, empty states, and loading UI.
 */

import React from "react";
import { Check } from "@promptstudio/system/components/ui";
import { useImagePreview } from "../hooks/useImagePreview";
import type { PreviewProvider } from "../api/previewApi";
import { cn } from "@/utils/cn";

interface VisualPreviewProps {
  prompt: string;
  aspectRatio?: string | null | undefined;
  isVisible: boolean;
  seedImageUrl?: string | null;
  generateRequestId?: number;
  lastGeneratedAt?: number | null;
  onImageSelected?: (imageUrl: string, index: number) => void;
  selectedImageIndex?: number | null;
  onPreviewGenerated?:
    | ((payload: {
        prompt: string;
        generatedAt: number;
        imageUrl?: string | null;
        aspectRatio?: string | null;
      }) => void)
    | undefined;
  onLoadingChange?: ((loading: boolean) => void) | undefined;
  onKeepRefining?: (() => void) | undefined;
  onRefinePrompt?: (() => void) | undefined;
  provider?: PreviewProvider;
  onProviderChange?: ((provider: PreviewProvider) => void) | undefined;
  useReferenceImage?: boolean;
  onUseReferenceImageChange?:
    | ((useReferenceImage: boolean) => void)
    | undefined;
  onErrorChange?: ((error: string | null) => void) | undefined;
  onPreviewStateChange?:
    | ((payload: {
        provider: PreviewProvider;
        useReferenceImage: boolean;
        loading: boolean;
        error: string | null;
        imageUrl: string | null;
        imageUrls: Array<string | null>;
      }) => void)
    | undefined;
}

const SUPPORTED_ASPECT_RATIOS = new Set([
  "1:1",
  "16:9",
  "21:9",
  "2:3",
  "3:2",
  "4:5",
  "5:4",
  "9:16",
  "9:21",
]);

const normalizeAspectRatio = (value?: string | null): string | null => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/\s+/g, "").replace(/x/i, ":");

  if (SUPPORTED_ASPECT_RATIOS.has(normalized)) {
    return normalized;
  }

  if (
    normalized === "2.39:1" ||
    normalized === "2.4:1" ||
    normalized === "2.35:1" ||
    normalized === "2.37:1"
  ) {
    return "21:9";
  }

  if (
    normalized === "1.85:1" ||
    normalized === "1.78:1" ||
    normalized === "1.77:1"
  ) {
    return "16:9";
  }

  const match = normalized.match(/(\d+(?:\.\d+)?[:x]\d+(?:\.\d+)?)/i);
  if (match?.[1]) {
    const extracted = match[1].replace(/x/i, ":");
    if (SUPPORTED_ASPECT_RATIOS.has(extracted)) {
      return extracted;
    }
    if (
      extracted === "2.39:1" ||
      extracted === "2.4:1" ||
      extracted === "2.35:1" ||
      extracted === "2.37:1"
    ) {
      return "21:9";
    }
    if (
      extracted === "1.85:1" ||
      extracted === "1.78:1" ||
      extracted === "1.77:1"
    ) {
      return "16:9";
    }
  }

  return null;
};

export const VisualPreview: React.FC<VisualPreviewProps> = ({
  prompt,
  aspectRatio = null,
  isVisible,
  seedImageUrl = null,
  generateRequestId,
  onImageSelected,
  selectedImageIndex = null,
  onPreviewGenerated,
  onLoadingChange,
  provider: controlledProvider,
  useReferenceImage: controlledUseReferenceImage,
  onErrorChange,
  onPreviewStateChange,
}) => {
  const normalizedAspectRatio = React.useMemo(
    () => normalizeAspectRatio(aspectRatio),
    [aspectRatio],
  );

  const [internalProvider] = React.useState<PreviewProvider>(
    "replicate-flux-schnell",
  );
  const provider = controlledProvider ?? internalProvider;

  const [internalUseReferenceImage] = React.useState(true);
  const useReferenceImage =
    controlledUseReferenceImage ?? internalUseReferenceImage;

  const { imageUrl, imageUrls, loading, error, regenerate } = useImagePreview({
    prompt,
    isVisible,
    ...(normalizedAspectRatio ? { aspectRatio: normalizedAspectRatio } : {}),
    provider,
    seedImageUrl,
    useReferenceImage,
  });
  const isKontext = provider === "replicate-flux-kontext-fast";
  const shouldShowGrid = isKontext && imageUrls.length > 0;
  const displayUrl = shouldShowGrid ? null : (imageUrl ?? seedImageUrl);
  const [lastRequestedPrompt, setLastRequestedPrompt] =
    React.useState<string>("");
  const lastReportedUrlRef = React.useRef<string | null>(null);
  const copyTimeoutRef = React.useRef<number | null>(null);
  const prevGenerateRequestIdRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const copyTimeoutId = copyTimeoutRef.current;
    return () => {
      if (copyTimeoutId !== null) {
        window.clearTimeout(copyTimeoutId);
      }
    };
  }, []);

  React.useEffect(() => {
    if (!imageUrl) return;
    if (lastReportedUrlRef.current === imageUrl) return;
    lastReportedUrlRef.current = imageUrl;
    if (onPreviewGenerated) {
      onPreviewGenerated({
        prompt: lastRequestedPrompt || prompt,
        generatedAt: Date.now(),
        imageUrl,
        aspectRatio: normalizedAspectRatio ?? null,
      });
    }
  }, [
    imageUrl,
    lastRequestedPrompt,
    normalizedAspectRatio,
    onPreviewGenerated,
    prompt,
  ]);

  React.useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  React.useEffect(() => {
    onErrorChange?.(error ? String(error) : null);
  }, [error, onErrorChange]);

  React.useEffect(() => {
    onPreviewStateChange?.({
      provider,
      useReferenceImage,
      loading,
      error: error ? String(error) : null,
      imageUrl: imageUrl ?? null,
      imageUrls,
    });
  }, [
    error,
    imageUrl,
    imageUrls,
    loading,
    onPreviewStateChange,
    provider,
    useReferenceImage,
  ]);

  const handleGenerate = React.useCallback(() => {
    setLastRequestedPrompt(prompt);
    regenerate();
  }, [prompt, regenerate]);

  React.useEffect(() => {
    if (!isVisible) return;
    if (generateRequestId == null) return;
    if (prevGenerateRequestIdRef.current === generateRequestId) return;
    prevGenerateRequestIdRef.current = generateRequestId;
    if (generateRequestId > 0) {
      handleGenerate();
    }
  }, [generateRequestId, handleGenerate, isVisible]);

  if (!isVisible) return null;

  // When the parent asks to generate, run regeneration internally.
  // Stage owns the CTA button and any empty/loading visuals.
  if (shouldShowGrid) {
    return (
      <div
        className="grid grid-cols-2 gap-2 bg-surface-2 p-2"
        aria-label="Preview frames"
      >
        {imageUrls.map((url, index) => (
          <button
            key={`${index}-${url ?? "empty"}`}
            type="button"
            disabled={!url}
            onClick={() => {
              if (url) {
                onImageSelected?.(url, index);
              }
            }}
            className={cn(
              "relative overflow-hidden rounded-md bg-surface-3 transition-all",
              "hover:ring-2 hover:ring-accent/50",
              selectedImageIndex === index && "ring-2 ring-accent",
              !url && "cursor-default",
            )}
          >
            {url ? (
              <>
                <img
                  src={url}
                  alt={`Frame ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                {selectedImageIndex === index && (
                  <div className="absolute right-2 top-2 rounded-full bg-accent p-1">
                    <Check className="h-4 w-4 text-app" />
                  </div>
                )}
              </>
            ) : (
              <div className="h-full w-full animate-pulse bg-surface-3" />
            )}
          </button>
        ))}
      </div>
    );
  }

  if (displayUrl) {
    return (
      <img
        src={displayUrl}
        alt="Preview"
        className="h-full w-full object-cover"
      />
    );
  }

  return null;
};
