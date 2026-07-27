import React from "react";
import { Link, useLocation } from "react-router-dom";
import { CaretDown, CaretRight } from "@promptstudio/system/components/ui";
import { Button } from "@promptstudio/system/components/ui/button";
import { useAuthUser } from "@hooks/useAuthUser";
import { VidraMark } from "@/components/brand";
import { cn } from "@/utils/cn";
import { FEATURES } from "@/config/features.config";
import { useWorkspaceProject } from "../hooks/useWorkspaceProject";
import { useWorkspaceCredits } from "../hooks/useWorkspaceCredits";
import { AccountPopover } from "./AccountPopover";

/* Vidra lockup — the shared brand mark beside the wordtype. */
function VidraLockup(): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-2.5">
      <VidraMark className="h-[26px] w-[26px] rounded-lg" />
      <span className="text-foreground text-[17px] font-semibold tracking-[-0.01em]">
        Vidra
      </span>
    </span>
  );
}

interface WorkspaceTopBarProps {
  /** Pre-work (empty state): drop the session breadcrumb + credits so only the
   *  wordmark and Library/avatar remain — the handoff's minimal top bar
   *  (REBUILD.md: "empty state carries a minimal top bar"). */
  minimal?: boolean;
}

export function WorkspaceTopBar({
  minimal = false,
}: WorkspaceTopBarProps = {}): React.ReactElement {
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
      {minimal ? (
        <span
          className="ps-rise inline-flex"
          style={{ animationDelay: "0.1s" }}
        >
          <VidraLockup />
        </span>
      ) : (
        <VidraLockup />
      )}
      {/*
        Display-only session breadcrumb — the current session's derived title
        (or "Untitled"), read via useWorkspaceProject. Hidden in the pre-work
        empty state (no session yet). A clickable rename was previously wired to
        component-state-only, which silently dropped the new name on remount —
        see UX rule "browsing is read-only, editing is explicit"; renames live
        in the Sessions panel. The CaretDown is decorative until the project
        switcher menu lands.
      */}
      {minimal ? null : (
        <>
          <CaretRight
            size={12}
            className="text-tool-text-subdued"
            weight="bold"
          />
          <span className="text-foreground inline-flex items-center gap-1 px-1 py-1 text-sm">
            {project.name}
            <CaretDown
              size={12}
              className="text-tool-text-subdued"
              aria-hidden="true"
            />
          </span>
        </>
      )}

      <div className="flex-1" />

      {!minimal && FEATURES.BILLING_UI ? (
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
      <div
        className={cn("flex items-center gap-1", minimal && "ps-rise")}
        style={minimal ? { animationDelay: "0.18s" } : undefined}
      >
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
