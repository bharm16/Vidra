import { type ReactElement } from "react";
import { Link } from "react-router-dom";
import { Button } from "@promptstudio/system/components/ui/button";
import { useAuthUser } from "@hooks/useAuthUser";
import { cn } from "@utils/cn";
import { ClipGrid } from "./home/ClipGrid";
import { CLIP_MANIFEST, type GalleryClip } from "./home/clipManifest";

interface HomePageProps {
  /** Curated clips for the gallery. Defaults to the static manifest. */
  readonly clips?: readonly GalleryClip[];
}

/**
 * Gallery landing (see CONTEXT.md). With an empty manifest this is the
 * one-screen manifesto — wordmark, the product one-liner, one line of
 * subcopy, and a single auth-aware CTA. With curated clips the grid grows
 * under the one-liner (ADR-0008, design-overhaul decision 6).
 */
export function HomePage({
  clips = CLIP_MANIFEST,
}: HomePageProps = {}): ReactElement {
  const user = useAuthUser();
  const hasClips = clips.length > 0;

  return (
    <div className="bg-app flex h-full flex-col overflow-y-auto">
      <main
        className={cn(
          "w-full px-4 py-16 sm:px-6",
          hasClips ? "mx-auto max-w-5xl" : "m-auto max-w-md",
        )}
      >
        <header className="mx-auto max-w-md text-center">
          <p className="text-overline text-faint">Vidra</p>
          <h1 className="text-heading-18 text-foreground mt-2">
            From one-line idea to one good clip.
          </h1>
          <p className="text-body-sm text-muted mt-2">
            Describe what you're imagining. Vidra expands it into a cinematic
            first frame, then brings it to life as an AI video clip.
          </p>
          <div className="mt-5 flex justify-center">
            <Button asChild className="rounded-full">
              {user ? (
                <Link to="/">Open workspace</Link>
              ) : (
                <Link to="/signin">Sign in</Link>
              )}
            </Button>
          </div>
        </header>
        {hasClips ? (
          <div className="mt-12">
            <ClipGrid clips={clips} />
          </div>
        ) : null}
      </main>
    </div>
  );
}
