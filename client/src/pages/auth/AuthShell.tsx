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
 * Auth shell — the one page frame for auth and account/billing surfaces.
 *
 * Styled entirely from @promptstudio/system semantic tokens so these pages
 * speak the workspace's monochrome language (ADR-0008).
 */
export function AuthShell({
  title,
  children,
  footer,
  variant = "auth",
}: AuthShellProps): React.ReactElement {
  const isAuth = variant === "auth";

  return (
    <div className="bg-app text-foreground flex min-h-full flex-col">
      {/* Header — mimics the rail's top area */}
      <header className="border-border flex items-center justify-between border-b px-5 py-4">
        <Link
          to="/home"
          className="text-foreground text-[14px] font-semibold tracking-tight transition hover:opacity-80"
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
              "text-foreground mb-5 text-[15px] font-semibold tracking-tight",
              isAuth && "text-center",
            )}
          >
            {title}
          </h1>

          {isAuth ? (
            <div className="ps-edge-lit border-border bg-surface-1 rounded-lg border p-5 shadow-md">
              {children}
            </div>
          ) : (
            <div>{children}</div>
          )}

          {footer ? (
            <div
              className={cn(
                "text-faint mt-4 text-[13px]",
                isAuth && "text-center",
              )}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
