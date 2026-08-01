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
      className={cn(
        "flex w-full items-center gap-3 rounded-md transition-colors",
        active
          ? "text-foreground bg-white/[0.07]"
          : "text-tool-text-muted hover:text-foreground hover:bg-white/[0.05]",
      )}
    >
      <span
        className={cn(
          "flex h-[42px] w-[42px] flex-none items-center justify-center",
          accent && "text-[color:color-mix(in_srgb,var(--accent)_62%,#fff)]",
        )}
      >
        {icon}
      </span>
      {collapsed ? null : (
        <span className="whitespace-nowrap text-ui font-medium">{label}</span>
      )}
    </Link>
  );
}

/**
 * The persistent navigation rail (design_handoff_vidra / Rail.dc.html) — the
 * workspace's chrome once the space exists (the empty state keeps a minimal top
 * bar instead). Collapses 240⇄64px; logo doubles as "new session".
 */
export function NavRail({ active = "none" }: NavRailProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false);
  const user = useAuthUser();
  const accountName =
    user?.displayName ?? user?.email?.split("@")[0] ?? "Guest";

  return (
    <aside
      className="bg-tool-surface-deep border-tool-rail-border flex h-full flex-none flex-col overflow-hidden border-r px-[11px] py-4 transition-[width] duration-[260ms] ease-out"
      style={{ width: collapsed ? 64 : 240 }}
    >
      {/* Header — logo (→ new session) + collapse toggle. */}
      <div
        className={cn(
          "mb-5 flex items-center gap-2",
          collapsed ? "flex-col" : "justify-between",
        )}
      >
        <Link
          to="/"
          title="New session"
          className="flex items-center gap-[11px] rounded-md p-1.5 transition-colors hover:bg-white/[0.04]"
        >
          <VidraMark className="h-[30px] w-[30px] rounded-md" />
          {collapsed ? null : (
            <span className="text-foreground whitespace-nowrap text-body-lg font-semibold tracking-[-0.01em]">
              Vidra
            </span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((c) => !c)}
          className="text-tool-text-muted hover:text-foreground h-[34px] w-[34px] rounded-md hover:bg-white/[0.06]"
        >
          <PanelLeft size={18} strokeWidth={1.8} />
        </Button>
      </div>

      {/* Primary nav. */}
      <div className="flex flex-col gap-1">
        <RailItem
          to="/"
          label="New session"
          collapsed={collapsed}
          accent
          active={active === "new"}
          icon={<Plus size={19} strokeWidth={1.9} />}
        />
        <RailItem
          to="/history"
          label="Library"
          collapsed={collapsed}
          active={active === "library"}
          icon={<LibraryIcon size={18} strokeWidth={1.8} />}
        />
        <RailItem
          to="/live-editor"
          label="Live editor"
          collapsed={collapsed}
          active={active === "live-editor"}
          icon={<Paintbrush size={18} strokeWidth={1.8} />}
        />
        <RailItem
          to="/studio"
          label="Studio"
          collapsed={collapsed}
          active={active === "studio"}
          icon={<Sparkles size={18} strokeWidth={1.8} />}
        />
      </div>

      <div className="flex-1" />

      {/* Docs + account. */}
      <RailItem
        to="/docs"
        label="Docs & help"
        collapsed={collapsed}
        icon={<CircleHelp size={18} strokeWidth={1.8} />}
      />
      <Link
        to={user ? "/account" : "/signin"}
        title="Account"
        className={cn(
          "mt-1.5 flex items-center gap-[11px] rounded-md p-1.5 transition-colors hover:bg-white/[0.05]",
          active === "account" && "bg-white/[0.06]",
        )}
      >
        <span className="border-border bg-muted text-muted-foreground flex h-8 w-8 flex-none items-center justify-center rounded-full border text-ui font-semibold uppercase">
          {accountName.charAt(0)}
        </span>
        {collapsed ? null : (
          <span className="flex min-w-0 flex-col items-start whitespace-nowrap">
            <span className="text-foreground text-ui font-semibold">
              {accountName}
            </span>
            <span className="text-tool-text-muted mt-px font-mono text-meta">
              {user?.email ?? "Sign in"}
            </span>
          </span>
        )}
      </Link>
    </aside>
  );
}
