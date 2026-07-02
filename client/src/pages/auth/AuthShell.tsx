import React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/utils/cn";

type AuthShellProps = {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /**
   * 'auth' — narrow centered card for sign-in / sign-up / password flows (default)
   * 'page' — wider container for account/billing pages that need more room
   */
  variant?: "auth" | "page";
  /** Legacy props — accepted for backward compatibility, ignored in rendering */
  eyebrow?: string;
  subtitle?: string;
};

/**
 * Auth shell styled to match the workspace tool-panel aesthetic.
 *
 * Uses the exact tool-sidebar palette so auth pages feel like they're
 * inside the app rather than a separate marketing site.
 *
 * Key colors (from --tool-* CSS vars):
 *   #131416  — rail / panel bg
 *   #16181E  — card surface
 *   #1B1E23  — rail border (subtle)
 *   #2C3037  — border-primary (cards, inputs)
 *   #22252C  — nav-active bg (card borders)
 *   #0F1118  — inset surface (input bg)
 */
export function AuthShell({
  title,
  children,
  footer,
  variant = "auth",
}: AuthShellProps): React.ReactElement {
  const isAuth = variant === "auth";

  return (
    <div
      className="flex min-h-full flex-col text-white"
      style={{ background: "#131416" }}
    >
      {/* Header — mimics the rail's top area */}
      <header
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid #1B1E23" }}
      >
        <Link
          to="/home"
          className="text-[14px] font-semibold tracking-tight text-white transition hover:opacity-80"
          aria-label="Go to Vidra home"
        >
          Vidra
        </Link>
      </header>

      {/* Content */}
      <main
        className={cn(
          "flex flex-1 flex-col items-center px-5 pb-10",
          isAuth ? "justify-center pt-10" : "pt-8",
        )}
      >
        <div className={cn("w-full", isAuth ? "max-w-[400px]" : "max-w-3xl")}>
          <h1
            className={cn(
              "mb-5 text-[15px] font-semibold tracking-tight text-white",
              isAuth && "text-center",
            )}
          >
            {title}
          </h1>

          {isAuth ? (
            <div
              className="rounded-[10px] p-5"
              style={{
                background: "#16181E",
                border: "1px solid #22252C",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.02), 0 4px 12px rgba(0,0,0,0.4)",
              }}
            >
              {children}
            </div>
          ) : (
            <div>{children}</div>
          )}

          {footer ? (
            <div
              className={cn("mt-4 text-[13px]", isAuth && "text-center")}
              style={{ color: "#8B92A5" }}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
