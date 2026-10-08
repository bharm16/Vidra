import React from "react";
import type { HistoryThumbnailRef } from "@features/history/utils/historyMedia";
import { useResolvedMediaUrl } from "@/hooks/useResolvedMediaUrl";
import { rewriteGcsUrlToProxy } from "@/services/media/MediaUrlResolver";
import imageIcon from "@/assets/design-system/library-image.svg";

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

  // Signed GCS urls expire after an hour; the media proxy is the only path
  // that can rescue an expired one, so it is the only form the cover ever
  // hands to <img> — including the first paint, before resolution settles.
  const src = rewriteGcsUrlToProxy(resolvedUrl?.trim?.() ?? "") ?? "";
  const showFallback = src.length === 0 || src === erroredSrc;

  if (showFallback) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--vidra-stage-placeholder)]">
        <img src={imageIcon} alt="" draggable={false} />
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
