import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@promptstudio/system/components/ui/button";
import { cn } from "@/utils/cn";
import { useAuthUser } from "@hooks/useAuthUser";
import { useCompactViewport } from "@/hooks/useCompactViewport";
import brandIcon from "@/assets/design-system/nav-brand.svg";
import collapseIcon from "@/assets/design-system/nav-collapse.svg";
import plusIcon from "@/assets/design-system/nav-plus.svg";
import libraryIcon from "@/assets/design-system/nav-library.svg";
import liveIcon from "@/assets/design-system/nav-live.svg";
import studioIcon from "@/assets/design-system/nav-studio.svg";
import helpIcon from "@/assets/design-system/nav-help.svg";

type RailActive =
  | "new"
  | "library"
  | "live-editor"
  | "studio"
  | "account"
  | "none";

interface NavRailProps {
  active?: RailActive;
}

interface RailItemProps {
  to: string;
  label: string;
  icon: string;
  active?: boolean;
  collapsed: boolean;
}

function RailItem({
  to,
  label,
  icon,
  active = false,
  collapsed,
}: RailItemProps): React.ReactElement {
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className={cn(
        "h-9 w-full justify-start gap-2 rounded-md px-2 font-normal",
        active && "bg-float",
      )}
    >
      <Link
        to={to}
        title={collapsed ? label : undefined}
        aria-label={collapsed ? label : undefined}
        aria-current={active ? "page" : undefined}
      >
        <img src={icon} alt="" draggable={false} className="shrink-0" />
        {collapsed ? null : <span className="whitespace-nowrap">{label}</span>}
      </Link>
    </Button>
  );
}

/** Page 21 navigation rail: 56px header, 36px destinations and 12px gutters. */
export function NavRail({ active = "none" }: NavRailProps): React.ReactElement {
  // Each layout keeps its own preference so resizing cannot open the rail on a
  // phone or discard a deliberate desktop collapse.
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const compactViewport = useCompactViewport();
  const collapsed = compactViewport ? !mobileExpanded : desktopCollapsed;
  const user = useAuthUser();
  const accountName =
    user?.displayName ?? user?.email?.split("@")[0] ?? "Guest";

  return (
    <aside
      aria-label="Primary navigation"
      className="flex h-full flex-none flex-col overflow-hidden border-r-[length:var(--vidra-border-hairline)] border-white bg-black transition-[width] duration-[260ms] ease-out"
      style={{ width: collapsed ? 64 : 256 }}
    >
      <div
        className={cn(
          "flex shrink-0 gap-2 p-3",
          collapsed ? "h-[88px] flex-col items-center" : "h-14 items-center",
        )}
      >
        <Link
          to="/"
          title="Vidra home"
          aria-label="Vidra home"
          className={cn(
            "flex h-7 items-center gap-2 font-sans text-ui font-normal",
            collapsed ? "w-10 justify-center" : "min-w-0 flex-1",
          )}
        >
          <img src={brandIcon} alt="" draggable={false} className="shrink-0" />
          {collapsed ? null : <span>Vidra</span>}
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() =>
            compactViewport
              ? setMobileExpanded((value) => !value)
              : setDesktopCollapsed((value) => !value)
          }
          className={cn("shrink-0 rounded-md", collapsed && "w-10")}
        >
          <img src={collapseIcon} alt="" draggable={false} />
        </Button>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-4 p-3">
        <Button
          asChild
          variant="secondary"
          size="sm"
          className={cn(
            "h-9 shrink-0 gap-2 px-3 font-normal",
            collapsed ? "w-9 p-0" : "w-full",
          )}
        >
          <Link
            to="/"
            aria-label={collapsed ? "New session" : undefined}
            title={collapsed ? "New session" : undefined}
          >
            <img src={plusIcon} alt="" draggable={false} className="shrink-0" />
            {collapsed ? null : <span>New session</span>}
          </Link>
        </Button>
        <div className="flex shrink-0 flex-col gap-1">
          <RailItem
            to="/history"
            label="Library"
            collapsed={collapsed}
            active={active === "library"}
            icon={libraryIcon}
          />
          <RailItem
            to="/live-editor"
            label="Live editor"
            collapsed={collapsed}
            active={active === "live-editor"}
            icon={liveIcon}
          />
          <RailItem
            to="/studio"
            label="Studio"
            collapsed={collapsed}
            active={active === "studio"}
            icon={studioIcon}
          />
        </div>
        <div className="min-h-0 flex-1" />
        <div className="flex shrink-0 flex-col gap-2">
          <RailItem
            to="/docs"
            label="Docs & help"
            collapsed={collapsed}
            icon={helpIcon}
          />
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={cn(
              "h-9 w-full gap-3 rounded-md px-3 font-normal",
              collapsed ? "justify-center p-0" : "justify-start",
              active === "account" && "bg-float",
            )}
          >
            <Link
              to={user ? "/account" : "/signin"}
              title={user ? "Account" : "Sign in"}
              aria-label={
                collapsed ? (user ? "Account" : "Sign in") : undefined
              }
              aria-current={active === "account" ? "page" : undefined}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-fill text-meta font-normal uppercase">
                {accountName.charAt(0)}
              </span>
              {collapsed ? null : (
                <span className="min-w-0 truncate">
                  {user ? accountName : "Sign in"}
                </span>
              )}
            </Link>
          </Button>
        </div>
      </nav>
    </aside>
  );
}
