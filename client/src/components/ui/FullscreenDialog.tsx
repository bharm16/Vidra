import type { ReactElement, ReactNode } from "react";
import {
  Dialog,
  DialogDescription,
  DialogContent,
  DialogTitle,
} from "@promptstudio/system/components/ui/dialog";
import { useAnimatedPresence } from "@/hooks/useAnimatedPresence";
import { cn } from "@/utils/cn";

interface FullscreenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  exitMs?: number;
  contentClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
}

export function FullscreenDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  exitMs = 220,
  contentClassName,
  titleClassName,
  descriptionClassName,
}: FullscreenDialogProps): ReactElement | null {
  const { shouldRender, phase } = useAnimatedPresence(open, { exitMs });

  if (!shouldRender) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        forceMount
        data-fullscreen-dialog-content="true"
        data-motion-state={phase}
        onPointerDownOutside={() => onOpenChange(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onOpenChange(false);
          }
        }}
        className={cn(
          "motion-presence-panel left-0 top-0 h-screen max-h-none max-w-none translate-x-0 translate-y-0 gap-0 border-0 bg-transparent p-0 shadow-none duration-0 sm:rounded-none [&>button:last-child]:hidden",
          contentClassName,
        )}
      >
        <DialogTitle className={cn("sr-only", titleClassName)}>
          {title}
        </DialogTitle>
        {description ? (
          <DialogDescription className={cn("sr-only", descriptionClassName)}>
            {description}
          </DialogDescription>
        ) : null}
        {children}
      </DialogContent>
    </Dialog>
  );
}
