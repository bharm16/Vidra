import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@promptstudio/system/lib/utils";
import loaderLight from "./loader-light.svg";
import loaderDark from "./loader-dark.svg";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-ui font-[450] transition-colors focus-visible:!outline-none focus-visible:ring-2 focus-visible:ring-[var(--vidra-border-focus)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-icon-md [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-white text-primary-foreground hover:bg-white/90",
        destructive: "bg-secondary text-foreground hover:bg-hover",
        outline:
          "border border-border bg-transparent text-muted hover:border-border-strong hover:bg-hover hover:text-foreground",
        secondary: "bg-secondary text-foreground hover:bg-hover",
        ghost: "bg-transparent text-foreground hover:bg-hover",
        canvas: "bg-transparent text-foreground hover:bg-hover",
        "canvas-solid": "bg-secondary text-foreground hover:bg-hover",
        gradient: "bg-white text-primary-foreground hover:bg-white/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-8 px-3 text-ui",
        sm: "h-10 px-3 text-ui",
        default: "h-10 px-6",
        md: "h-10 px-6",
        lg: "h-12 rounded-md px-6",
        xl: "h-12 rounded-md px-8",
        icon: "h-9 w-12 p-0",
        "icon-xs": "h-7 w-7 p-0 [&_svg]:size-icon-sm",
        "icon-sm": "h-9 w-9 p-0",
        "icon-lg": "h-12 w-12 p-0 [&_svg]:size-icon-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    // When loading with asChild, we can't safely inject the spinner into the slotted component
    // Fall back to a regular button to show the loading state properly
    const Comp = asChild && !loading ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        aria-disabled={disabled || loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <span className="sr-only">Loading</span>
            <span className="relative inline-flex translate-x-3 items-center gap-2">
              <img
                src={
                  !variant || variant === "default" || variant === "gradient"
                    ? loaderDark
                    : loaderLight
                }
                alt=""
                draggable={false}
                className="absolute right-full top-1/2 mr-2 -translate-y-1/2 animate-spin"
              />
              {children}
            </span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
