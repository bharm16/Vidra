/**
 * Brand logo with link to home.
 */

import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { cn } from "@utils/cn";
import type { BrandLogoProps } from "../types";

export function BrandLogo({
  variant,
  className,
}: BrandLogoProps): ReactElement {
  if (variant === "sidebar-collapsed") {
    return (
      <Link
        to="/"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md",
          "text-foreground bg-[rgb(44,48,55)]",
          "transition-colors hover:bg-[rgb(36,42,56)]",
          className,
        )}
        aria-label="Vidra home"
      >
        <span className="text-body-sm font-semibold">V</span>
      </Link>
    );
  }

  return (
    <Link
      to="/"
      className={cn(
        "text-foreground hover:text-foreground/80 tracking-tight transition-colors",
        variant === "topnav" ? "text-heading-20" : "text-[16px] font-semibold",
        className,
      )}
      aria-label="Vidra home"
    >
      Vidra
    </Link>
  );
}
