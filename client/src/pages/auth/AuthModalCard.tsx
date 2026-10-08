import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@promptstudio/system/components/ui/button";
import { VidraMark } from "@/components/brand";
import authClose from "@/assets/design-system/auth-close.svg";

import "./auth.css";

interface AuthModalCardProps {
  /** Centered card title (handoff: "Welcome back"). */
  heading: string;
  /** The line beneath the title — the mode toggle or a short instruction. */
  subhead?: React.ReactNode;
  headingIcon?: React.ReactNode;
  /** The form column body (buttons + inputs). */
  children: React.ReactNode;
  /**
   * Where the brand mark and the corner close both navigate. Defaults to the
   * app root — the handoff's dismiss target.
   */
  dismissTo?: string;
}

/* Vidra lockup — the shared brand mark + wordtype, mirrored from
   WorkspaceTopBar so the auth stage carries the same signature. */
export function AuthBrand(): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-2.5">
      <VidraMark className="h-[26px] w-[26px]" />
      <span className="text-foreground text-body-lg font-normal">Vidra</span>
    </span>
  );
}

/** Shared Page 21 authentication surface; pages retain their auth logic. */
export function AuthModalCard({
  heading,
  subhead,
  headingIcon,
  children,
  dismissTo = "/",
}: AuthModalCardProps): React.ReactElement {
  return (
    <div className="text-foreground relative isolate flex min-h-screen flex-col bg-canvas px-4 pb-10 pt-[88px]">
      <Link
        to={dismissTo}
        aria-label="Vidra home"
        className="absolute left-8 top-7 z-10 inline-flex transition-opacity hover:opacity-80"
      >
        <AuthBrand />
      </Link>

      <main className="flex flex-1 items-center justify-center">
        <div className="ps-auth-modal relative z-10 w-full max-w-[440px]">
          {/* Form column */}
          <div className="flex w-full flex-col">
            {headingIcon ? <div className="mb-3">{headingIcon}</div> : null}
            <h1 className="whitespace-pre-line text-foreground text-display-lg font-medium">
              {heading}
            </h1>
            {subhead ? (
              <p className="whitespace-pre-line text-foreground mt-3 text-body">
                {subhead}
              </p>
            ) : null}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </main>
      <Button
        asChild
        variant="ghost"
        size="icon-lg"
        className="absolute right-6 top-5 z-10 rounded-md"
      >
        <Link to={dismissTo} aria-label="Close">
          <img src={authClose} alt="" />
        </Link>
      </Button>
    </div>
  );
}
