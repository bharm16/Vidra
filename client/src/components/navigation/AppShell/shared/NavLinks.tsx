/**
 * Navigation links rendered in horizontal or vertical layout.
 */

import type { ReactElement } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@utils/cn";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@promptstudio/system/components/ui/tooltip";
import type { NavLinksProps } from "../types";

export function NavLinks({
  items,
  variant,
  className,
}: NavLinksProps): ReactElement {
  if (variant === "vertical-collapsed") {
    return (
      <TooltipProvider delayDuration={120}>
        <nav className={cn("flex flex-col items-center gap-2", className)}>
          {items.map((item) => (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "flex h-8 w-8 items-center justify-center rounded-md",
                      "text-muted transition-colors",
                      "hover:text-foreground hover:bg-[rgb(36,42,56)]",
                      isActive && "text-foreground bg-[rgb(44,48,55)]",
                    )
                  }
                  aria-label={item.label}
                >
                  <item.icon size={18} />
                </NavLink>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="text-body-sm text-foreground rounded-lg border border-[rgb(67,70,81)] bg-[rgb(24,25,28)] shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
              >
                {item.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </nav>
      </TooltipProvider>
    );
  }

  if (variant === "vertical") {
    return (
      <nav className={cn("flex flex-col gap-1", className)}>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2",
                "text-muted text-[13px] font-medium transition-colors",
                "hover:text-foreground hover:bg-[rgba(255,255,255,0.05)]",
                isActive && "text-foreground bg-[rgba(255,255,255,0.08)]",
              )
            }
          >
            <item.icon size={16} className="flex-shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    );
  }

  return (
    <nav className={cn("flex items-center gap-2", className)}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              "text-overline block rounded-md px-4 py-2 uppercase transition-colors",
              isActive
                ? "bg-surface-3 text-foreground"
                : "text-muted hover:text-foreground",
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
