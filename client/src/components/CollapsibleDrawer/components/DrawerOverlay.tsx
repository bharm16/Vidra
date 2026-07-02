import React from "react";
import { cn } from "@/utils/cn";

interface DrawerOverlayProps {
  isOpen: boolean;
  onClick: () => void;
  className?: string;
}

export function DrawerOverlay({
  isOpen,
  onClick,
  className,
}: DrawerOverlayProps): React.ReactElement | null {
  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 z-drawer bg-black/40 backdrop-blur-sm",
        className,
      )}
      onClick={onClick}
      role="presentation"
      aria-hidden="true"
    />
  );
}
