import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  CircleHelp,
  Library as LibraryIcon,
  Paintbrush,
  PanelLeft,
  Plus,
  Sparkles,
} from "lucide-react";
import { Button } from "@promptstudio/system/components/ui/button";
import { VidraMark } from "@/components/brand";
import { cn } from "@/utils/cn";
import { useAuthUser } from "@hooks/useAuthUser";

type RailActive =
  | "new"
  | "library"
  | "live-editor"
  | "studio"
  | "account"
  | "none";

interface NavRailProps {
  /** Which destination the current route represents, for the active highlight. */
  active?: RailActive;
}

interface RailItemProps {
  to: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  collapsed: boolean;
  /** Accent-tint the icon (the primary "New session" action). */
  accent?: boolean;
}

function RailItem({
  to,
  label,
  icon,
  active = false,
  collapsed,
  accent = false,
}: RailItemProps): React.ReactElement {
  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        // The shared control base owns height, type, gap, fill and states —
        // including the selected treatment, which keys off aria-current.
        "ps-btn ps-btn--md ps-btn--rect ps-btn--quiet",
        // Expanded, the row is full-width and left-aligned; collapsed, the
        // base's centring is what we want.
        !collapsed && "ps-btn--row",
      )}
    >
      <span className={cn("flex flex-none items-center justify-center")}>
        {icon}
      </span>
      {collapsed ? null : <span className="whitespace-nowrap">{label}</span>}
    </Link>
  );
}

/**
 * The persistent navigation rail (design_handoff_vidra / Rail.dc.html) — the
 * workspace's chrome once the space exists (the empty state keeps a minimal top
 * bar instead). Collapses 256⇄64px; logo doubles as "new session".
 */
export function NavRail({ active = "none" }: NavRailProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false);
  const user = useAuthUser();
  const accountName =
    user?.displayName ?? user?.email?.split("@")[0] ?? "Guest";

  return (
    <aside
      // 16px gutters, not 8. At 8 the 240px-wide pills had almost no air
      // either side of them and the filled CTA read as bleeding into the
      // rail's edges; items reflow to 224 inside the same 256px rail.
      className="bg-canvas flex h-full flex-none flex-col overflow-hidden px-4 pb-4 transition-[width] duration-[260ms] ease-out"
      style={{ width: collapsed ? 64 : 256 }}
    >
      {/* Header — logo (→ new session) + collapse toggle. */}
      <div
        className={cn(
          // A 44px band flush with the top, so the rail's header baseline is the
          // topbar's: the 8px of rail padding used to push it down and "Vidra"
          // sat 9px lower than "Studio".
          "mb-2 flex h-11 items-center gap-2",
          collapsed ? "flex-col" : "justify-between",
        )}
      >
        <Link
          to="/"
          title="New session"
          className="hover:bg-hover flex h-9 items-center gap-2 rounded-md p-2 transition-colors"
        >
          <VidraMark className="h-6 w-6 flex-none rounded-sm" />
          {collapsed ? null : (
            <span className="text-foreground text-ui whitespace-nowrap font-medium">
              Vidra
            </span>
          )}
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((c) => !c)}
          className="ps-btn ps-btn--icon ps-btn--rect ps-btn--quiet"
        >
          <PanelLeft strokeWidth={1.75} />
        </Button>
      </div>

      {/* The verb, separated from the destinations. Styled as a nav row it was
          indistinguishable from Library and Studio, so the rail read as four
          equal-weight places with nothing to do — the reference tools all put
          a filled primary at the top of the rail. */}
      <Link
        to="/"
        title={collapsed ? "New session" : undefined}
        className={cn(
          "ps-btn ps-btn--md ps-btn--rect ps-btn--primary mb-3",
          !collapsed && "ps-btn--row justify-center",
        )}
      >
        <Plus strokeWidth={1.75} />
        {collapsed ? null : (
          <span className="whitespace-nowrap">New session</span>
        )}
      </Link>

      {/* Destinations. */}
      <div className="flex flex-col gap-1">
        <RailItem
          to="/history"
          label="Library"
          collapsed={collapsed}
          active={active === "library"}
          icon={<LibraryIcon strokeWidth={1.75} />}
        />
        <RailItem
          to="/live-editor"
          label="Live editor"
          collapsed={collapsed}
          active={active === "live-editor"}
          icon={<Paintbrush strokeWidth={1.75} />}
        />
        <RailItem
          to="/studio"
          label="Studio"
          collapsed={collapsed}
          active={active === "studio"}
          icon={<Sparkles strokeWidth={1.75} />}
        />
      </div>

      <div className="flex-1" />

      {/* Docs + account. */}
      <RailItem
        to="/docs"
        label="Docs & help"
        collapsed={collapsed}
        icon={<CircleHelp strokeWidth={1.75} />}
      />
      <Link
        to={user ? "/account" : "/signin"}
        title="Account"
        className={cn(
          "ps-btn ps-btn--md ps-btn--rect ps-btn--quiet ps-btn--row mt-1.5",
          active === "account" && "bg-active",
        )}
      >
        <span className="border-border bg-chrome text-fg text-meta flex h-6 w-6 flex-none items-center justify-center rounded-full border font-medium uppercase tracking-normal">
          {accountName.charAt(0)}
        </span>
        {collapsed ? null : (
          // One quiet line. This was the largest and one of only two 400-weight
          // labels in the rail, for the least important action; signed out it
          // additionally said "Guest" over "Sign in" — the same thing twice.
          <span className="text-tool-text-muted text-meta min-w-0 truncate font-medium tracking-normal">
            {user ? accountName : "Sign in"}
          </span>
        )}
      </Link>
    </aside>
  );
}
