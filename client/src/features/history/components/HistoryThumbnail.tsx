import React from "react";
import { Image } from "@promptstudio/system/components/ui";
import { cn } from "@/utils/cn";
import { useResolvedMediaUrl } from "@/hooks/useResolvedMediaUrl";

type HistoryThumbnailSize = "sm" | "md" | "lg";
type HistoryThumbnailVariant = "default" | "muted";

interface HistoryThumbnailProps {
  src?: string | null;
  storagePath?: string | null;
  assetId?: string | null;
  label?: string;
  size?: HistoryThumbnailSize;
  variant?: HistoryThumbnailVariant;
  isActive?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<HistoryThumbnailSize, string> = {
  sm: "ps-thumb-size-sm",
  md: "ps-thumb-size-md",
  lg: "ps-thumb-size-lg",
};

export function HistoryThumbnail({
  src,
  storagePath,
  assetId,
  label = "Prompt thumbnail",
  size = "sm",
  variant = "default",
  isActive = false,
  className,
}: HistoryThumbnailProps): React.ReactElement {
  // The src that last fired onError. Deciding the fallback at render time
  // (rather than inside the async onError handler) guarantees a failed fetch
  // can never leave a broken <img> behind: either the refresh applies a
  // genuinely new URL (re-rendering the <img> with a fresh candidate), or the
  // rendered src still equals the errored one and the letter avatar shows.
  const [erroredSrc, setErroredSrc] = React.useState<string | null>(null);
  const refreshAttemptedRef = React.useRef(false);
  const { url: resolvedUrl, refresh } = useResolvedMediaUrl({
    kind: "image",
    url: src ?? null,
    storagePath: storagePath ?? null,
    assetId: assetId ?? null,
  });

  React.useEffect(() => {
    setErroredSrc(null);
    refreshAttemptedRef.current = false;
  }, [src]);

  const normalizedSrc = resolvedUrl?.trim?.() ?? "";
  const hasSrc = normalizedSrc.length > 0;
  const showFallback = !hasSrc || normalizedSrc === erroredSrc;

  const fallbackChar = React.useMemo(() => {
    const raw = (label ?? "").trim();
    if (!raw) return "";
    const match = raw.match(/[A-Za-z0-9]/);
    return (match?.[0] ?? "").toUpperCase();
  }, [label]);

  const variantClass =
    variant === "muted" ? "ps-thumb-muted" : "ps-thumb-placeholder";

  return (
    <div
      className={cn(
        "ps-thumb-frame flex flex-shrink-0 items-center justify-center bg-[rgb(44,48,55)]",
        SIZE_CLASSES[size],
        isActive && "ps-thumb-active",
        className,
      )}
    >
      {showFallback ? (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center",
            variantClass,
          )}
        >
          {fallbackChar ? (
            <span className="text-[14px] font-medium leading-none text-[rgb(198,201,210)]">
              {fallbackChar}
            </span>
          ) : (
            <Image className="text-faint h-4 w-4" aria-hidden="true" />
          )}
        </div>
      ) : (
        <img
          src={normalizedSrc}
          alt={label}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => {
            // Mark this src dead first — if the refresh below cannot apply a
            // different URL (same URL, no URL, or the resolver failed), the
            // render-time check falls back to the letter avatar instead of
            // leaving a broken <img> (blank tile) behind.
            setErroredSrc(normalizedSrc);
            if (refreshAttemptedRef.current) {
              return;
            }
            refreshAttemptedRef.current = true;
            void refresh("error");
          }}
        />
      )}
    </div>
  );
}
