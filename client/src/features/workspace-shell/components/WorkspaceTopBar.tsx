import React from "react";
import { Link, useLocation } from "react-router-dom";
import { CaretDown, CaretRight } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import { useAuthUser } from "@hooks/useAuthUser";
import { FEATURES } from "@/config/features.config";
import { useWorkspaceProject } from "../hooks/useWorkspaceProject";
import { useWorkspaceCredits } from "../hooks/useWorkspaceCredits";
import { AccountPopover } from "./AccountPopover";

/* Vidra wordmark — rotated-square mark + text. Inline SVG so the logo travels
   with the component without a separate asset request. */
function VidraMark(): React.ReactElement {
  return (
    <span className="text-foreground inline-flex items-center gap-2">
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="3"
          y="3"
          width="12"
          height="12"
          rx="1.5"
          transform="rotate(45 9 9)"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M9 4.5L9 13.5M4.5 9L13.5 9"
          stroke="currentColor"
          strokeWidth="0.8"
          opacity="0.6"
        />
      </svg>
      <span className="text-sm font-medium tracking-tight">Vidra</span>
    </span>
  );
}

export function WorkspaceTopBar(): React.ReactElement {
  const project = useWorkspaceProject();
  const credits = useWorkspaceCredits();
  const user = useAuthUser();
  const location = useLocation();
  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);

  return (
    <header
      className="border-tool-rail-border bg-tool-surface-deep flex h-[var(--workspace-topbar-h)] items-center gap-3 border-b px-4"
      role="banner"
    >
      <VidraMark />
      <CaretRight size={12} className="text-tool-text-subdued" weight="bold" />
      {/*
        Display-only session label — the current session's derived title (or
        "Untitled"), read via useWorkspaceProject. A clickable rename was
        previously wired to component-state-only, which silently dropped the
        new name on remount — see UX rule "browsing is read-only, editing is
        explicit"; renames live in the Sessions panel. The CaretDown is
        decorative until the project switcher menu lands.
      */}
      <span className="text-foreground inline-flex items-center gap-1 px-1 py-1 text-sm">
        {project.name}
        <CaretDown
          size={12}
          className="text-tool-text-subdued"
          aria-hidden="true"
        />
      </span>

      <div className="flex-1" />

      {FEATURES.BILLING_UI ? (
        <span
          className="text-tool-text-dim font-mono text-[11px]"
          aria-label="Credits remaining"
          title={`${credits.credits.toLocaleString()} credits`}
        >
          {credits.credits.toLocaleString()}
          <span className="text-tool-text-subdued ml-1">cr</span>
        </span>
      ) : null}

      {/* Right-side chrome cluster (ADR-0010 site-scope D7): the tool rail is
        gone, so the account affordance lives here. Library + avatar are
        signed-in affordances; a signed-out visitor gets a sign-in link. */}
      <div className="flex items-center gap-1">
        {user ? (
          <>
            <Button asChild variant="ghost" size="sm">
              <Link to="/history">Library</Link>
            </Button>
            <AccountPopover user={user} />
          </>
        ) : (
          <Button asChild variant="ghost" size="sm">
            <Link to={`/signin?redirect=${returnTo}`}>Sign in</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
