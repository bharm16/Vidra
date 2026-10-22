"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@promptstudio/system/lib/utils";

/** Radix types forceMount as the literal `true`, so it is spread only when set. */
const mounting = (forceMount: true | undefined): { forceMount?: true } => (forceMount ? { forceMount } : {});

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    portalContainer?: HTMLElement | null | undefined;
  }
>(({ className, align = "center", sideOffset = 4, portalContainer, forceMount, ...props }, ref) => (
  // forceMount keeps a closing popover mounted while the client folds it back into its trigger.
  <PopoverPrimitive.Portal container={portalContainer} {...mounting(forceMount)}>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      {...mounting(forceMount)}
      className={cn(
        "z-overlay w-72 rounded-xl border-[0.5px] border-border bg-popover p-ps-4 text-popover-foreground shadow-elevated outline-none",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
