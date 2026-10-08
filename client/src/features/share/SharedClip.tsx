import React from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@promptstudio/system/components/ui/button";
import { VideoPlayer } from "@components/MediaViewer/components/VideoPlayer";
import { useSharedClip } from "./hooks/useSharedClip";
import { cn } from "@/utils/cn";
import brandIcon from "@/assets/design-system/shared-brand.svg";
import arrowIcon from "@/assets/design-system/shared-arrow.svg";

/** Public shared clip with the Page 21 player, caption and creation link. */

/* Vidra lockup — the shared brand mark beside the wordtype, linking home
   (mirrors the app's WorkspaceTopBar lockup). */
function VidraLockup(): React.ReactElement {
  return (
    <Link
      to="/"
      aria-label="Vidra home"
      className="inline-flex items-center gap-[11px]"
    >
      <img src={brandIcon} alt="" draggable={false} />
      <span className="text-foreground text-body-lg font-normal leading-7">
        Vidra
      </span>
    </Link>
  );
}

/* The same supporting creation action appears in loaded and missing states. */
function StartYourOwnCta({
  className,
}: {
  className?: string;
}): React.ReactElement {
  return (
    <Button
      asChild
      variant="secondary"
      size="sm"
      className={cn(
        "h-9 w-[182.59px] gap-2 bg-fill px-3 font-normal",
        className,
      )}
    >
      <Link to="/">
        Start your own clip
        <img src={arrowIcon} alt="" draggable={false} />
      </Link>
    </Button>
  );
}

/* The standalone public clip chrome remains available in every read state. */
function ClipShell({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="text-foreground flex min-h-screen flex-col bg-[var(--vidra-public-surface)] font-sans">
      {/* Public chrome */}
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b-[0.5px] border-white px-4 sm:px-10">
        <VidraLockup />
        <Button
          asChild
          variant="secondary"
          size="sm"
          className="h-9 w-[70.88px] bg-fill px-3 font-normal text-muted"
        >
          <Link to="/signin">Sign in</Link>
        </Button>
      </header>

      {/* Stage */}
      <main className="flex flex-col items-center px-6 pb-16">{children}</main>
    </div>
  );
}

export default function SharedClip(): React.ReactElement {
  const { uuid } = useParams<{ uuid: string }>();
  const { clip, loading, notFound, error } = useSharedClip(uuid);

  if (loading) {
    return (
      <ClipShell>
        <div className="text-center">
          <div className="border-border inline-block h-12 w-12 animate-spin rounded-full border-4 border-r-transparent" />
          <p className="text-tool-text-muted mt-4 font-mono text-xs">
            Loading clip…
          </p>
        </div>
      </ClipShell>
    );
  }

  if (error || notFound || !clip) {
    return (
      <ClipShell>
        <div className="max-w-md text-center">
          <h1 className="text-heading font-medium">Clip not found</h1>
          <p className="mt-3 text-ui font-normal text-muted">
            This clip doesn&rsquo;t exist or is no longer shared.
          </p>
          <StartYourOwnCta className="mt-7" />
        </div>
      </ClipShell>
    );
  }

  return (
    <ClipShell>
      <div className="relative aspect-video w-full max-w-[784px] overflow-hidden rounded-xl bg-black after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-[0.5px] after:ring-inset after:ring-white after:content-['']">
        <VideoPlayer
          src={clip.videoUrl}
          className="h-full w-full rounded-none"
          autoPlay
          loop
          muted
          controls
        />
      </div>

      {/* Description — the paired prompt, set as a centered caption. The
          curly quotes are decorative (aria-hidden) and kept out of the text
          node so the caption reads cleanly to assistive tech. */}
      {clip.description ? (
        <p className="mt-6 max-w-[600px] whitespace-pre-wrap text-center text-body-lg font-normal leading-7 text-muted">
          <span aria-hidden>&ldquo;</span>
          <span>{clip.description}</span>
          <span aria-hidden>&rdquo;</span>
        </p>
      ) : null}

      {/* CTA — the growth loop back to the workspace. */}
      <div className="mt-7 flex flex-col items-center gap-3">
        <StartYourOwnCta />
        <span className="text-meta font-normal text-muted">
          Free to try &middot; no account needed to watch
        </span>
      </div>
    </ClipShell>
  );
}
