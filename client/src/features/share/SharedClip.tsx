import React from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@promptstudio/system/components/ui/button";
import { AmbientLight, Grain, Vignette } from "@components/atmosphere";
import { VideoPlayer } from "@components/MediaViewer/components/VideoPlayer";
import { useSharedClip } from "./hooks/useSharedClip";

/**
 * Public clip page (ADR-0010 site-scope D8; visual rebuild to
 * design_handoff_vidra / ADR-0014).
 *
 * A logged-out visitor sees a shared clip as the cinematic hero + its paired
 * description + a "start your own" CTA back to the workspace — the growth loop
 * that replaces the prompt-era share. The page is a dark, atmospheric stage:
 * ambient light + grain sit behind the content (negative z, inside the isolated
 * root); a vignette frames over it.
 *
 * Data/loading/notFound/error behavior is unchanged from useSharedClip — this
 * is a presentation rebuild only.
 */

/* Vidra brand mark — the design-handoff logo: an accent-gradient rounded square
   holding a play glyph, beside the wordtype. Links home. Inline SVG so the mark
   travels with the page without a separate asset request (mirrors the app's
   WorkspaceTopBar mark). */
function VidraMark(): React.ReactElement {
  return (
    <Link
      to="/"
      aria-label="Vidra home"
      className="inline-flex items-center gap-[11px]"
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-lg"
        style={{
          background:
            "linear-gradient(150deg, var(--accent, #5b6cff), var(--accent-2, #9aa6ff))",
          boxShadow: "0 4px 14px -4px var(--accent, #5b6cff)",
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="#0a0b0e"
          aria-hidden
        >
          <path d="M3.2 2.4a.6.6 0 0 1 .92-.5l5 3.6a.6.6 0 0 1 0 1l-5 3.6a.6.6 0 0 1-.92-.5z" />
        </svg>
      </span>
      <span className="text-foreground text-[20px] font-semibold tracking-[-0.01em]">
        Vidra
      </span>
    </Link>
  );
}

/* The white pill CTA — the growth loop's call to action, back to the workspace.
   Shared by the clip and not-found states so the two stay identical. */
function StartYourOwnCta({
  className,
}: {
  className?: string;
}): React.ReactElement {
  return (
    <Button
      asChild
      size="lg"
      className={`text-app h-auto gap-2 rounded-[13px] bg-white px-6 py-3.5 text-[15px] font-semibold shadow-[0_12px_32px_-10px_rgba(255,255,255,0.34)] transition-transform hover:-translate-y-px hover:bg-white hover:shadow-[0_16px_40px_-10px_rgba(255,255,255,0.46)] ${className ?? ""}`}
    >
      <Link to="/">
        Start your own clip
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </svg>
      </Link>
    </Button>
  );
}

/* The atmospheric shell every state renders inside: the isolated dark stage with
   ambient light + grain behind, the public chrome bar on top, and the vignette
   framing over it. Content is centered in the stage. */
function ClipShell({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="bg-app text-foreground relative isolate flex h-full min-h-full flex-col overflow-hidden font-sans">
      <AmbientLight />
      <Grain />

      {/* Public chrome */}
      <header className="relative flex h-[72px] shrink-0 items-center justify-between border-b border-white/[0.05] px-10">
        <VidraMark />
        <Button
          asChild
          variant="outline"
          className="text-tool-text-secondary hover:text-foreground h-auto rounded-[11px] border-white/[0.16] bg-white/[0.04] px-[18px] py-[9px] text-[13.5px] font-medium hover:border-white/[0.16] hover:bg-white/[0.09]"
        >
          <Link to="/signin">Sign in</Link>
        </Button>
      </header>

      {/* Stage */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-6 pb-16">
        {children}
      </main>

      <Vignette intensity="default" />
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
        <div className="ps-rise max-w-md text-center">
          <h1 className="text-[26px] font-semibold tracking-[-0.01em]">
            Clip not found
          </h1>
          <p className="text-tool-text-dim mt-3 text-[15px] leading-relaxed">
            This clip doesn&rsquo;t exist or is no longer shared.
          </p>
          <StartYourOwnCta className="mt-7" />
        </div>
      </ClipShell>
    );
  }

  return (
    <ClipShell>
      {/* Player — the cinematic hero: a 16:9 frame with an accent-tinted ring
          glow and a deep drop shadow, rising in on entrance. */}
      <div
        className="ps-rise relative aspect-video w-full max-w-[784px] overflow-hidden rounded-[20px] border border-white/[0.14] bg-black"
        style={{
          boxShadow:
            "0 44px 96px -34px rgba(0,0,0,0.82), 0 0 0 6px color-mix(in srgb, var(--accent) 6%, transparent)",
        }}
      >
        <VideoPlayer
          src={clip.videoUrl}
          className="h-full w-full rounded-none"
          autoPlay
          loop
          muted
          controls
        />
      </div>

      {/* Description — the paired prompt, set as a centered italic caption. The
          curly quotes are decorative (aria-hidden) and kept out of the text
          node so the caption reads cleanly to assistive tech. */}
      {clip.description ? (
        <p
          className="ps-rise text-tool-text-dim mt-6 max-w-[600px] whitespace-pre-wrap text-center text-[17px] italic leading-[1.55]"
          style={{ animationDelay: "0.1s" }}
        >
          <span aria-hidden>&ldquo;</span>
          <span>{clip.description}</span>
          <span aria-hidden>&rdquo;</span>
        </p>
      ) : null}

      {/* CTA — the growth loop back to the workspace. */}
      <div
        className="ps-rise mt-7 flex flex-col items-center gap-3"
        style={{ animationDelay: "0.2s" }}
      >
        <StartYourOwnCta />
        <span className="text-tool-text-muted font-mono text-xs">
          Free to try &middot; no account needed to watch
        </span>
      </div>
    </ClipShell>
  );
}
