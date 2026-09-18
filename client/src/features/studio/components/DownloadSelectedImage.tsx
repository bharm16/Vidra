import React from "react";
import type { StudioTurn } from "../api/schemas";

/**
 * "Download SVG" for the selected vector image (issue #118).
 *
 * Bound to the project's SELECTION, in the topbar's right zone, for the same
 * reason `UseInSessionAction` is: the selection is the project's "this one",
 * and a per-cell control would be a button inside a button.
 *
 * Only vectors get the control. Their view URL is served as an attachment
 * (Content-Disposition), so opening it downloads the `.svg` rather than
 * rendering it — which is also the XSS defense for user-supplied SVG. A raster
 * view URL is served inline, so the same anchor would open it in place instead
 * of downloading; raster download is not this ticket's scope, so it is left
 * off rather than served the wrong way.
 */

interface DownloadSelectedImageProps {
  turns: StudioTurn[];
  /** Null when nothing is selected — the control has no subject then. */
  selectedImageId: string | null;
}

/** The stored image the selection points at, if the studio produced it. */
function findSelectedImage(
  turns: StudioTurn[],
  selectedImageId: string,
): StudioTurn["calls"][number]["image"] | undefined {
  for (const turn of turns) {
    for (const call of turn.calls) {
      if (call.status === "succeeded" && call.image?.id === selectedImageId) {
        return call.image;
      }
    }
  }
  return undefined;
}

/** Vectors are persisted as `.svg` objects in their own storage lane (#118). */
function isVectorImage(image: { storagePath: string }): boolean {
  return image.storagePath.endsWith(".svg");
}

export function DownloadSelectedImage({
  turns,
  selectedImageId,
}: DownloadSelectedImageProps): React.ReactElement | null {
  if (!selectedImageId) return null;
  const image = findSelectedImage(turns, selectedImageId);
  if (!image?.viewUrl || !isVectorImage(image)) return null;

  return (
    <a
      className="st-topbar-label underline"
      href={image.viewUrl}
      data-testid="studio-download-svg"
    >
      Download SVG
    </a>
  );
}
