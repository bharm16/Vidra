import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "@promptstudio/system/lib/utils";
import off from "./switch-off.svg";
import on from "./switch-on.svg";
import offFocus from "./switch-off-focus.svg";
import onFocus from "./switch-on-focus.svg";
import offDisabled from "./switch-off-disabled.svg";
import onDisabled from "./switch-on-disabled.svg";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "group peer relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full focus-visible:!outline-none disabled:cursor-not-allowed",
      className,
    )}
    {...props}
    ref={ref}
  >
    <img
      src={off}
      alt=""
      draggable={false}
      className="pointer-events-none absolute max-w-none left-0 top-0 hidden group-data-[state=unchecked]:block group-focus-visible:!hidden group-disabled:!hidden"
    />
    <img
      src={on}
      alt=""
      draggable={false}
      className="pointer-events-none absolute max-w-none left-0 top-0 hidden group-data-[state=checked]:block group-focus-visible:!hidden group-disabled:!hidden"
    />
    <img
      src={offFocus}
      alt=""
      draggable={false}
      className="pointer-events-none absolute max-w-none -left-0.5 -top-0.5 hidden group-[[data-state=unchecked]:focus-visible]:block group-disabled:!hidden"
    />
    <img
      src={onFocus}
      alt=""
      draggable={false}
      className="pointer-events-none absolute max-w-none -left-0.5 -top-0.5 hidden group-[[data-state=checked]:focus-visible]:block group-disabled:!hidden"
    />
    <img
      src={offDisabled}
      alt=""
      draggable={false}
      className="pointer-events-none absolute max-w-none left-0 top-0 hidden group-[[data-state=unchecked]:disabled]:block"
    />
    <img
      src={onDisabled}
      alt=""
      draggable={false}
      className="pointer-events-none absolute max-w-none left-0 top-0 hidden group-[[data-state=checked]:disabled]:block"
    />
    <SwitchPrimitives.Thumb className="sr-only" />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
