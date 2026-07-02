import { useMemo, type ReactElement } from "react";
import { Home } from "@promptstudio/system/components/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@promptstudio/system/components/ui/tooltip";
import { Link, useLocation } from "react-router-dom";
import { useBillingStatus } from "@/features/billing/hooks/useBillingStatus";
import { BalancePill } from "@/components/navigation/AppShell/shared/BalancePill";
import { ToolNavButton } from "./ToolNavButton";
import { toolNavItems } from "../config/toolNavConfig";
import type { ToolRailProps } from "../types";

export function ToolRail({
  activePanel,
  onPanelChange,
  user,
}: ToolRailProps): ReactElement {
  const location = useLocation();
  const { status, isLoading: isLoadingStatus } = useBillingStatus();
  const sessionsItem = toolNavItems.find((item) => item.variant === "header");
  const navItems = toolNavItems.filter((item) => item.variant === "default");
  const photoURL = typeof user?.photoURL === "string" ? user.photoURL : null;
  const displayName =
    typeof user?.displayName === "string" ? user.displayName.trim() : "";
  const email = typeof user?.email === "string" ? user.email.trim() : "";
  const initial = (displayName || email || "U").slice(0, 1).toUpperCase();
  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
  const userActionLink = user ? "/account" : `/signin?redirect=${returnTo}`;
  const userActionLabel = user ? "Account" : "Sign in";
  const planLabel = useMemo((): string => {
    if (isLoadingStatus) return "…";
    if (!user) return "Sign in";
    if (!status?.isSubscribed) return "Free";
    const tier = status.planTier;
    if (!tier) return "Free";
    return tier.charAt(0).toUpperCase() + tier.slice(1);
  }, [user, status, isLoadingStatus]);

  // Keep planLabel referenced to avoid lint unused-variable error
  void planLabel;

  const handlePanelChange = (panelId: typeof activePanel): void => {
    if (panelId === "sessions") {
      // Toggle sessions — if already viewing sessions, go back to studio
      onPanelChange(activePanel === "sessions" ? "studio" : "sessions");
      return;
    }
    onPanelChange(panelId);
  };

  return (
    <TooltipProvider delayDuration={120}>
      <aside
        className="border-tool-rail-border bg-tool-rail-bg flex h-full w-[52px] flex-none flex-col items-center border-r px-1.5 py-3"
        aria-label="Tool navigation"
      >
        {/* The "V" text mark previously lived here — removed because the Vidra
          wordmark now lives in WorkspaceTopBar, and the screenshot has no
          top mark. Style-only change. */}

        {/* ── Nav items: Tool, Characters, Styles, Gallery ── */}
        <nav
          className="flex flex-col items-center gap-1"
          aria-label="Tool panels"
        >
          {navItems.map((item) => (
            <ToolNavButton
              key={item.id}
              icon={item.icon}
              label={item.label}
              isActive={activePanel === item.id}
              onClick={() => handlePanelChange(item.id)}
            />
          ))}
          <div
            className="bg-tool-rail-border my-1.5 h-px w-6"
            aria-hidden="true"
          />
          {sessionsItem ? (
            <ToolNavButton
              icon={sessionsItem.icon}
              label={sessionsItem.label}
              isActive={activePanel === "sessions"}
              onClick={() => handlePanelChange("sessions")}
              variant="header"
            />
          ) : null}
        </nav>

        <div className="flex-1" />

        {/* ── Bottom: Balance + Home + Profile ── */}
        <div className="flex flex-col items-center gap-1 pb-2">
          {/* Persistent credit balance — visible on every route, not just
            the workspace home. Only show when signed in. */}
          {user ? <BalancePill /> : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/home"
                className="text-tool-text-muted hover:bg-tool-nav-hover hover:text-tool-text-primary flex h-10 w-10 items-center justify-center rounded-xl transition-colors"
                aria-label="Home"
              >
                <Home size={20} weight="regular" />
              </Link>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              className="text-body-sm text-foreground rounded-lg border border-[rgb(67,70,81)] bg-[rgb(24,25,28)] shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
            >
              Home
            </TooltipContent>
          </Tooltip>

          <div
            className="bg-tool-rail-border my-1.5 h-px w-6"
            aria-hidden="true"
          />

          {/* ── Profile avatar ── */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to={userActionLink}
                className="flex h-8 w-8 items-center justify-center"
                aria-label={userActionLabel}
              >
                {photoURL ? (
                  <img
                    src={photoURL}
                    alt=""
                    className="h-8 w-8 rounded-lg object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="bg-surface-2 flex h-8 w-8 items-center justify-center rounded-lg">
                    <span className="text-body-sm font-bold text-white">
                      {initial}
                    </span>
                  </div>
                )}
              </Link>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              className="text-body-sm text-foreground rounded-lg border border-[rgb(67,70,81)] bg-[rgb(24,25,28)] shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
            >
              {userActionLabel}
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
