import React from "react";
import { Link } from "react-router-dom";
import { X } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import { AmbientLight, Grain, Vignette } from "@/components/atmosphere";

import "./auth.css";

interface AuthModalCardProps {
  /** Centered card title (handoff: "Welcome back"). */
  heading: string;
  /** The line beneath the title — the mode toggle or a short instruction. */
  subhead?: React.ReactNode;
  /** The form column body (buttons + inputs). */
  children: React.ReactNode;
  /**
   * Where the brand mark and the corner close both navigate. Defaults to the
   * app root — the handoff's dismiss target.
   */
  dismissTo?: string;
}

/* Vidra wordmark — the design-handoff brand mark (accent-gradient rounded
   square + wordtype), mirrored from WorkspaceTopBar so the auth stage carries
   the same signature. */
function VidraMark(): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="ps-auth-mark flex h-[26px] w-[26px] items-center justify-center rounded-lg">
        <svg
          width="11"
          height="11"
          viewBox="0 0 12 12"
          fill="#0a0b0e"
          aria-hidden="true"
        >
          <path d="M3.2 2.4a.6.6 0 0 1 .92-.5l5 3.6a.6.6 0 0 1 0 1l-5 3.6a.6.6 0 0 1-.92-.5z" />
        </svg>
      </span>
      <span className="text-foreground text-[17px] font-semibold tracking-[-0.01em]">
        Vidra
      </span>
    </span>
  );
}

/* The sunset showcase — a purely decorative gradient panel beside the form
   (handoff right column). Layered gradients + a slow-floating light bloom. */
function AuthShowcase(): React.ReactElement {
  return (
    <div
      aria-hidden
      className="ps-auth-showcase relative hidden md:block md:w-[332px] md:shrink-0"
    >
      <div className="ps-auth-showcase__wash absolute inset-0" />
      <div className="ps-auth-showcase__bloom absolute left-[14%] top-[8%] h-[250px] w-[250px] rounded-full" />
      <div className="ps-auth-showcase__base absolute inset-x-0 bottom-0 h-2/5" />
      <div className="ps-auth-showcase__hill-a absolute inset-x-[-10%] bottom-[13%] h-[86px] rounded-[50%]" />
      <div className="ps-auth-showcase__hill-b absolute bottom-[5%] left-[-20%] right-[10%] h-[74px] rounded-[50%]" />
    </div>
  );
}

/**
 * The auth surface frame — atmospheric dark stage + centered glass modal with a
 * two-column layout (form column + sunset showcase). Rebuilt from
 * design_handoff_vidra/Auth.dc.html (ADR-0014); the sign-in / sign-up / reset
 * pages supply the heading, subhead and form body and keep all their own auth
 * logic.
 */
export function AuthModalCard({
  heading,
  subhead,
  children,
  dismissTo = "/",
}: AuthModalCardProps): React.ReactElement {
  return (
    <div className="text-foreground relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[color:var(--ps-bg)] px-4 py-12">
      {/* Atmosphere backdrop (ADR-0014): ambient light + grain sit behind the
          content (negative z, inside this isolated root); the vignette frames
          over them but below the modal. */}
      <AmbientLight />
      <Grain />
      <Vignette />

      <Link
        to={dismissTo}
        aria-label="Vidra home"
        className="absolute left-6 top-6 z-10 inline-flex transition-opacity hover:opacity-80"
      >
        <VidraMark />
      </Link>

      <div className="ps-auth-modal relative z-10 flex w-[min(100%-2rem,412px)] overflow-hidden rounded-[24px] border border-white/[0.08] bg-white/[0.045] shadow-[0_50px_110px_-30px_rgba(0,0,0,0.8)] backdrop-blur-[16px] backdrop-saturate-150 md:w-[744px]">
        {/* Form column */}
        <div className="flex w-full flex-col px-8 pb-8 pt-10 sm:px-9 md:w-[412px] md:shrink-0">
          <h1 className="text-foreground text-center text-[28px] font-semibold leading-[1.05] tracking-[-0.015em]">
            {heading}
          </h1>
          {subhead ? (
            <p className="text-tool-text-muted mt-[9px] text-center text-[13px]">
              {subhead}
            </p>
          ) : null}
          <div className="mt-6">{children}</div>
        </div>

        <AuthShowcase />

        <Button
          asChild
          variant="ghost"
          size="icon"
          className="absolute right-[15px] top-[15px] z-10 h-[30px] w-[30px] rounded-full border border-white/[0.24] bg-black/40 text-white backdrop-blur-[4px] hover:bg-black/60 hover:text-white"
        >
          <Link to={dismissTo} aria-label="Close">
            <X />
          </Link>
        </Button>
      </div>
    </div>
  );
}
