import React from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@promptstudio/system/components/ui/button";
import { VideoPlayer } from "@components/MediaViewer/components/VideoPlayer";
import { useSharedClip } from "./hooks/useSharedClip";

/**
 * Public clip page (ADR-0010 site-scope D8).
 *
 * A logged-out visitor sees a shared clip + its paired description + a
 * "make your own" CTA back to the workspace — the growth loop that replaces
 * the prompt-era share ("Original Input / Optimized Output" + quality score).
 */
export default function SharedClip(): React.ReactElement {
  const { uuid } = useParams<{ uuid: string }>();
  const { clip, loading, notFound, error } = useSharedClip(uuid);

  if (loading) {
    return (
      <div className="bg-app text-foreground flex h-full min-h-full items-center justify-center">
        <div className="text-center">
          <div className="border-border inline-block h-12 w-12 animate-spin rounded-full border-4 border-r-transparent" />
          <p className="text-label-sm text-muted mt-4">Loading clip…</p>
        </div>
      </div>
    );
  }

  if (error || notFound || !clip) {
    return (
      <div className="bg-app text-foreground flex h-full min-h-full items-center justify-center">
        <div className="max-w-md p-8 text-center">
          <h1 className="text-h2 mb-4 font-semibold">Clip not found</h1>
          <p className="text-body-sm text-muted mb-6">
            This clip doesn&apos;t exist or is no longer shared.
          </p>
          <Button asChild variant="default">
            <Link to="/">Make your own</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-app text-foreground h-full min-h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
          <VideoPlayer src={clip.videoUrl} autoPlay loop muted controls />
        </div>

        {clip.description ? (
          <p className="text-body text-foreground mt-6 whitespace-pre-wrap">
            {clip.description}
          </p>
        ) : null}

        <div className="border-border mt-10 border-t pt-6 text-center">
          <p className="text-label-sm text-muted">Made with Vidra</p>
          <Button asChild variant="default" className="mt-3">
            <Link to="/">Make your own</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
