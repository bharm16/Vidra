/**
 * Curated clip manifest for the gallery landing (see CONTEXT.md — "Gallery
 * landing").
 *
 * Dropping entries here is the only step needed to grow the gallery: with an
 * empty manifest the landing renders the one-screen manifesto; with entries
 * it renders the clip grid under the one-liner. The manifest is statically
 * imported — never fetched.
 */

/** Aspect ratio of a curated clip's tile. */
export type ClipAspect = "16:9" | "9:16" | "1:1";

/** One curated Vidra-made clip on the gallery landing. */
export interface GalleryClip {
  /** URL of the looping clip (mp4/webm) — bundled asset or hosted file. */
  readonly src: string;
  /** Poster frame shown before the clip loads. */
  readonly poster: string;
  /** One-line caption shown under the tile. */
  readonly caption: string;
  /** Tile aspect ratio. */
  readonly aspect: ClipAspect;
}

/** Ships empty until dogfooding produces clips worth curating. */
export const CLIP_MANIFEST: readonly GalleryClip[] = [];
