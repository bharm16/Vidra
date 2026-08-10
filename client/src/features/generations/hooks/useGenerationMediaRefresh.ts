import { useEffect, useRef, useState } from "react";
import {
  resolveMediaUrl,
  isMediaCircuitOpen,
  type MediaUrlRequest,
} from "@/services/media/MediaUrlResolver";
import { logger } from "@/services/LoggingService";
import type { Generation } from "../types";
import type { GenerationsAction } from "./useGenerationsState";

const log = logger.child("MediaRefresh");
const MEDIA_REFRESH_RETRY_COOLDOWN_MS = 15_000;
/** Minimum hidden duration (ms) before a visibility wake triggers re-resolution. */
const VISIBILITY_WAKE_THRESHOLD_MS = 60_000;

const buildSignature = (g: Generation): string =>
  `${g.id}:${g.status}:${g.mediaUrls?.length ?? 0}:${g.thumbnailUrl ?? ""}`;

const getErrorStatus = (error: unknown): number | null => {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
};

const isRetryableError = (error: unknown): boolean => {
  const status = getErrorStatus(error);
  if (status === 429) return true;
  if (status !== null && status >= 500 && status <= 599) return true;
  return false;
};

const resolveAssetHints = (
  ref: string | null | undefined,
): { mediaRef: string | null } => {
  const normalizedRef = typeof ref === "string" ? ref.trim() : "";
  return { mediaRef: normalizedRef || null };
};

const resolveGenerationMedia = async (
  generation: Generation,
): Promise<{ updates: Partial<Generation>; signature: string } | null> => {
  const hasMedia = generation.mediaUrls.length > 0;
  const hasThumb = Boolean(generation.thumbnailUrl);

  if (!hasMedia && !hasThumb) {
    return null;
  }

  const mediaKind = generation.mediaType === "video" ? "video" : "image";
  const assetRefs = generation.mediaAssetIds;

  const resolvedMediaUrls = [...generation.mediaUrls];

  if (hasMedia) {
    for (let index = 0; index < generation.mediaUrls.length; index += 1) {
      const url = generation.mediaUrls[index] ?? "";
      const { mediaRef } = resolveAssetHints(assetRefs?.[index] || null);
      const request: MediaUrlRequest = {
        kind: mediaKind,
        url,
        preferFresh: false,
        ...(mediaRef !== null ? { mediaRef } : {}),
      };
      const result = await resolveMediaUrl(request);
      resolvedMediaUrls[index] = result.url ?? url;
    }
  }

  const resolvedThumbnail = generation.thumbnailUrl
    ? ((
        await resolveMediaUrl({
          kind: "image",
          url: generation.thumbnailUrl,
          preferFresh: false,
        })
      ).url ?? generation.thumbnailUrl)
    : generation.thumbnailUrl;

  const mediaChanged = resolvedMediaUrls.some(
    (url, index) => url !== generation.mediaUrls[index],
  );
  const thumbChanged = resolvedThumbnail !== generation.thumbnailUrl;

  if (!mediaChanged && !thumbChanged) {
    return null;
  }

  const updates: Partial<Generation> = {};
  if (mediaChanged) {
    updates.mediaUrls = resolvedMediaUrls;
  }
  if (thumbChanged) {
    updates.thumbnailUrl = resolvedThumbnail ?? null;
  }

  const resolvedMediaUrls_ = updates.mediaUrls ?? generation.mediaUrls;
  const resolvedThumb = updates.thumbnailUrl ?? generation.thumbnailUrl ?? "";
  const signature = `${generation.id}:${generation.status}:${resolvedMediaUrls_.length}:${resolvedThumb}`;

  return { updates, signature };
};

export function useGenerationMediaRefresh(
  generations: Generation[],
  dispatch: React.Dispatch<GenerationsAction>,
): void {
  const inFlightRef = useRef<Set<string>>(new Set());
  const processedRef = useRef<Map<string, string>>(new Map());
  const retryAfterRef = useRef<Map<string, number>>(new Map());
  const retryTimersRef = useRef<Map<string, number>>(new Map());
  const prevSignaturesRef = useRef<Map<string, string>>(new Map());
  const lastRetryTokenRef = useRef(0);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const retryTimers = retryTimersRef.current;
    const retryAfter = retryAfterRef.current;

    return () => {
      for (const timeoutId of retryTimers.values()) {
        window.clearTimeout(timeoutId);
      }
      retryTimers.clear();
      retryAfter.clear();
    };
  }, []);

  // Invalidate processed media when the page wakes after extended sleep so that
  // expired GCS signed URLs get re-resolved instead of showing broken thumbnails.
  const hiddenAtRef = useRef<number | null>(null);
  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      // Page became visible
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt === null) return;
      const hiddenDuration = Date.now() - hiddenAt;
      if (hiddenDuration < VISIBILITY_WAKE_THRESHOLD_MS) return;

      log.debug(
        "Page woke after extended sleep, invalidating processed media",
        {
          hiddenDurationMs: hiddenDuration,
        },
      );
      processedRef.current.clear();
      setRetryToken((value) => value + 1);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    // Stale-item targeting: compute signatures for all completed generations
    // and skip the entire refresh if nothing has changed since last run.
    const nextSignatures = new Map<string, string>();
    for (const g of generations) {
      nextSignatures.set(g.id, buildSignature(g));
    }
    const hasStaleItems = (() => {
      if (nextSignatures.size !== prevSignaturesRef.current.size) return true;
      for (const [id, sig] of nextSignatures) {
        if (prevSignaturesRef.current.get(id) !== sig) return true;
      }
      return false;
    })();
    const retryTokenChanged = retryToken !== lastRetryTokenRef.current;
    lastRetryTokenRef.current = retryToken;
    prevSignaturesRef.current = nextSignatures;

    // Stale-item targeting: skip entirely if no generation signatures changed
    // and this run wasn't triggered by a retry timer or visibility wake.
    if (!hasStaleItems && !retryTokenChanged) {
      return;
    }

    // Bug 10 fix: prune processedRef entries for generations that were removed
    const currentIds = new Set(generations.map((g) => g.id));
    for (const id of processedRef.current.keys()) {
      if (!currentIds.has(id)) {
        processedRef.current.delete(id);
      }
    }
    for (const id of retryAfterRef.current.keys()) {
      if (currentIds.has(id)) continue;
      retryAfterRef.current.delete(id);
      const timeoutId = retryTimersRef.current.get(id);
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      retryTimersRef.current.delete(id);
    }

    const runRefresh = async (): Promise<void> => {
      // Skip entirely if the circuit breaker is open (too many 404s)
      if (isMediaCircuitOpen()) {
        log.debug("Skipping media refresh — circuit breaker open");
        return;
      }

      const pendingGenerations: Generation[] = [];

      for (const generation of generations) {
        if (generation.status !== "completed") continue;
        if (!generation.mediaUrls.length && !generation.thumbnailUrl) continue;

        const signature = buildSignature(generation);
        if (processedRef.current.get(generation.id) === signature) continue;
        if (inFlightRef.current.has(generation.id)) continue;

        const retryAfter = retryAfterRef.current.get(generation.id);
        if (typeof retryAfter === "number" && Date.now() < retryAfter) continue;

        pendingGenerations.push(generation);

      }

      if (pendingGenerations.length === 0) return;

      // Resolve each opaque/legacy reference through the single media boundary.
      for (const generation of pendingGenerations) {
        if (!isActive) return;
        if (isMediaCircuitOpen()) return;

        const signature = buildSignature(generation);
        inFlightRef.current.add(generation.id);

        try {
          const result = await resolveGenerationMedia(generation);
          if (!isActive) return;
          retryAfterRef.current.delete(generation.id);
          const retryTimer = retryTimersRef.current.get(generation.id);
          if (retryTimer !== undefined) {
            window.clearTimeout(retryTimer);
            retryTimersRef.current.delete(generation.id);
          }

          if (result) {
            log.debug("Refreshed generation media", {
              id: generation.id,
              mediaUrlsChanged: result.updates.mediaUrls !== undefined,
              thumbnailChanged: result.updates.thumbnailUrl !== undefined,
            });
            dispatch({
              type: "UPDATE_GENERATION",
              payload: { id: generation.id, updates: result.updates },
            });
            processedRef.current.set(generation.id, result.signature);
            continue;
          }

          processedRef.current.set(generation.id, signature);
        } catch (error) {
          const shouldRetry = isRetryableError(error);
          if (shouldRetry) {
            const retryAt = Date.now() + MEDIA_REFRESH_RETRY_COOLDOWN_MS;
            retryAfterRef.current.set(generation.id, retryAt);

            if (!retryTimersRef.current.has(generation.id)) {
              const timeoutId = window.setTimeout(() => {
                retryTimersRef.current.delete(generation.id);
                retryAfterRef.current.delete(generation.id);
                setRetryToken((value) => value + 1);
              }, MEDIA_REFRESH_RETRY_COOLDOWN_MS);
              retryTimersRef.current.set(generation.id, timeoutId);
            }
          } else {
            processedRef.current.set(generation.id, signature);
          }

          log.error(
            "Error refreshing generation media",
            error instanceof Error ? error : undefined,
            {
              id: generation.id,
              retryScheduled: shouldRetry,
            },
          );
        } finally {
          inFlightRef.current.delete(generation.id);
        }
      }
    };

    void runRefresh();

    return () => {
      isActive = false;
    };
  }, [dispatch, generations, retryToken]);
}
