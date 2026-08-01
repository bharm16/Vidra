import React from "react";
import { cn } from "@/utils/cn";

interface VersionDividerProps {
  versionLabel: string;
  promptChanged: boolean;
  className?: string;
}

export function VersionDivider({
  versionLabel,
  promptChanged,
  className,
}: VersionDividerProps): React.ReactElement {
  return (
    <div
      className={cn("flex items-center gap-1.5 px-1 py-0.5", className)}
      role="separator"
      aria-label={`Version ${versionLabel}${promptChanged ? ", prompt edited" : ""}`}
    >
      <span className="text-meta font-medium text-tool-text-label">
        {versionLabel}
      </span>
      {promptChanged && (
        <span
          className="h-[3px] w-[3px] rounded-sm bg-amber-400/40"
          aria-label="Prompt edited"
        />
      )}
    </div>
  );
}
