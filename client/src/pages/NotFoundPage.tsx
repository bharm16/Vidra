import React from "react";
import { Link } from "react-router-dom";

export function NotFoundPage(): React.ReactElement {
  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: "var(--background)" }}
    >
      <div className="mx-auto max-w-md px-4 pb-16 pt-24 text-center sm:px-6">
        <p
          className="text-meta font-semibold tracking-[0.2em]"
          style={{ color: "var(--ghost-foreground)" }}
        >
          404
        </p>
        <h1 className="text-ui mt-2 font-semibold tracking-tight text-white">
          Page not found
        </h1>
        <p
          className="text-ui mt-2"
          style={{ color: "var(--muted-foreground)" }}
        >
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          to="/"
          className="text-ui mt-5 inline-flex h-9 items-center rounded-lg px-4 font-semibold transition"
          style={{
            background: "var(--foreground)",
            color: "var(--background)",
          }}
        >
          Back to workspace
        </Link>
      </div>
    </div>
  );
}
