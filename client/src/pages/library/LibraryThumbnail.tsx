import React from "react";
import { Image } from "@promptstudio/system/components/ui";
import type { HistoryThumbnailRef } from "@features/history/utils/historyMedia";
import { useResolvedMediaUrl } from "@/hooks/useResolvedMediaUrl";

interface LibraryThumbnailProps {
  thumbnail: HistoryThumbnailRef;
  label: string;
}

/**
 * Full-bleed cinematic cover for a Library card. Reuses the app's real media
 * wiring — `useResolvedMediaUrl` signs/refreshes Firebase-stored preview URLs —
 * but renders an `object-cover` image that fills the card frame rather than the
 * fixed-size rail avatar `HistoryThumbnail` produces. On a dead URL it falls
 * back to a muted frame panel (mirrors the handoff's `frame` placeholder).
 */
export function LibraryThumbnail({
  thumbnail,
  label,
}: LibraryThumbnailProps): React.ReactElement {
  // Decide the fallback at render time (not inside the async onError handler)
  // so a failed fetch can never leave a broken <img> behind — mirrors the
  // proven pattern in HistoryThumbnail.
  const [erroredSrc, setErroredSrc] = React.useState<string | null>(null);
  const refreshAttemptedRef = React.useRef(false);
  const { url: resolvedUrl, refresh } = useResolvedMediaUrl({
    kind: "image",
    url: thumbnail.url ?? null,
    storagePath: thumbnail.storagePath ?? null,
    assetId: thumbnail.assetId ?? null,
  });

  React.useEffect(() => {
    setErroredSrc(null);
    refreshAttemptedRef.current = false;
  }, [thumbnail.url]);

  const src = resolvedUrl?.trim?.() ?? "";
  const showFallback = src.length === 0 || src === erroredSrc;

  if (showFallback) {
    return (
      <div className="ps-thumb-muted flex h-full w-full items-center justify-center">
        <Image className="text-tool-text-label h-5 w-5" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={label}
      loading="lazy"
      className="h-full w-full object-cover"
      onError={() => {
        setErroredSrc(src);
        if (refreshAttemptedRef.current) return;
        refreshAttemptedRef.current = true;
        void refresh("error");
      }}
    />
  );
}
