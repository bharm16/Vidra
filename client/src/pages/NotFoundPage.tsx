import React from "react";
import { Link } from "react-router-dom";
import { AUTH_COLORS } from "./auth/auth-styles";

export function NotFoundPage(): React.ReactElement {
  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: AUTH_COLORS.bg }}
    >
      <div className="mx-auto max-w-md px-4 sm:px-6 pt-24 pb-16 text-center">
        <p
          className="text-meta font-semibold tracking-[0.2em]"
          style={{ color: AUTH_COLORS.textLabel }}
        >
          404
        </p>
        <h1 className="mt-2 text-ui font-semibold text-white tracking-tight">
          Page not found
        </h1>
        <p
          className="mt-2 text-ui"
          style={{ color: AUTH_COLORS.textSecondary }}
        >
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          to="/"
          className="mt-5 inline-flex h-9 items-center rounded-lg px-4 text-ui font-semibold transition"
          style={{ background: AUTH_COLORS.accent, color: AUTH_COLORS.bg }}
        >
          Back to workspace
        </Link>
      </div>
    </div>
  );
}
