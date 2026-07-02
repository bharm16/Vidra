/**
 * useImagePreview Hook
 *
 * Manages image preview state and generation.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  generatePreview,
  generateStoryboardPreview,
  type PreviewProvider,
  type PreviewSpeedMode,
} from "../api/previewApi";

interface UseImagePreviewOptions {
  prompt: string;
  isVisible: boolean;
  aspectRatio?: string;
  provider?: PreviewProvider;
  seedImageUrl?: string | null;
  useReferenceImage?: boolean;
  seed?: number;
  speedMode?: PreviewSpeedMode;
  outputQuality?: number;
}

interface UseImagePreviewReturn {
  imageUrl: string | null;
  imageUrls: Array<string | null>;
  loading: boolean;
  error: string | null;
  regenerate: () => void;
}

/**
 * Hook for managing image preview state
 *
 * @param options - Hook options
 * @returns Preview state and controls
 */
export function useImagePreview({
  prompt,
  isVisible,
  aspectRatio,
  provider,
  seedImageUrl = null,
  useReferenceImage = false,
  seed,
  speedMode,
  outputQuality,
}: UseImagePreviewOptions): UseImagePreviewReturn {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Array<string | null>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastPromptRef = useRef<string>("");
  const requestIdRef = useRef(0);

  useEffect(() => {
    setImageUrl(null);
    setImageUrls([]);
    setError(null);
    setLoading(false);
    lastPromptRef.current = "";
  }, [prompt, aspectRatio]);

  /**
   * Generate preview image
   */
  const generateImage = useCallback(
    async (promptToGenerate: string, isManual = false) => {
      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Don't generate if prompt is empty
      if (!promptToGenerate || promptToGenerate.trim().length === 0) {
        setImageUrl(null);
        setError(null);
        setLoading(false);
        return;
      }

      // Skip if prompt hasn't changed and it's not a manual regeneration
      if (!isManual && promptToGenerate === lastPromptRef.current && imageUrl) {
        return;
      }

      setLoading(true);
      setError(null);
      lastPromptRef.current = promptToGenerate;
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;

      // Create new abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        if (provider === "replicate-flux-kontext-fast") {
          setImageUrls(Array.from({ length: 4 }, () => null));
          const referenceImageUrl = imageUrl ?? seedImageUrl;
          const storyboardSeedImageUrl =
            useReferenceImage && referenceImageUrl
              ? referenceImageUrl
              : undefined;

          const response = await generateStoryboardPreview(promptToGenerate, {
            ...(aspectRatio ? { aspectRatio } : {}),
            ...(storyboardSeedImageUrl
              ? { seedImageUrl: storyboardSeedImageUrl }
              : {}),
            ...(seed !== undefined ? { seed } : {}),
            ...(speedMode ? { speedMode } : {}),
          });

          if (
            abortController.signal.aborted ||
            requestId !== requestIdRef.current
          ) {
            return;
          }

          if (!response.success) {
            throw new Error(
              response.message ||
                response.error ||
                "Failed to generate storyboard",
            );
          }
          if (Array.isArray(response.data.imageUrls)) {
            const urls = response.data.imageUrls;
            if (urls.length === 0) {
              throw new Error("Storyboard response contained no images");
            }
            const baseUrl = response.data.baseImageUrl || urls[0] || null;
            setImageUrl(baseUrl);
            setImageUrls(urls);
          } else {
            throw new Error("Failed to generate storyboard");
          }
          return;
        }

        setImageUrls([]);
        const response = await generatePreview(promptToGenerate, {
          ...(aspectRatio ? { aspectRatio } : {}),
          ...(provider ? { provider } : {}),
          ...(seed !== undefined ? { seed } : {}),
          ...(speedMode ? { speedMode } : {}),
          ...(outputQuality !== undefined ? { outputQuality } : {}),
        });

        if (
          abortController.signal.aborted ||
          requestId !== requestIdRef.current
        ) {
          return;
        }

        if (!response.success) {
          throw new Error(
            response.message || response.error || "Failed to generate preview",
          );
        }
        if (response.data.imageUrl) {
          setImageUrl(response.data.imageUrl);
        } else {
          throw new Error("Failed to generate preview");
        }
      } catch (err) {
        // Don't set error if request was aborted
        if (
          abortController.signal.aborted ||
          requestId !== requestIdRef.current
        ) {
          return;
        }

        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to generate preview image";
        setError(errorMessage);
        setImageUrl(null);
        setImageUrls([]);
      } finally {
        // Only update loading state if this request wasn't aborted
        if (
          !abortController.signal.aborted &&
          requestId === requestIdRef.current
        ) {
          setLoading(false);
        }
      }
    },
    [
      aspectRatio,
      imageUrl,
      outputQuality,
      provider,
      seed,
      seedImageUrl,
      speedMode,
      useReferenceImage,
    ],
  );

  /**
   * Manual regeneration trigger
   */
  const regenerate = useCallback(() => {
    if (prompt && prompt.trim().length > 0) {
      generateImage(prompt, true);
    }
  }, [prompt, generateImage]);

  /**
   * Effect: Clear image when prompt becomes empty or visibility changes
   * (Automatic generation disabled - use regenerate button instead)
   */
  useEffect(() => {
    // Don't generate if not visible - clear state
    if (!isVisible) {
      setLoading(false);
      return;
    }

    // Clear image if prompt is empty
    if (!prompt || prompt.trim().length === 0) {
      setImageUrl(null);
      setError(null);
      setLoading(false);
      return;
    }

    // No automatic generation - user must click regenerate button
  }, [prompt, isVisible]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    imageUrl,
    imageUrls,
    loading,
    error,
    regenerate,
  };
}
