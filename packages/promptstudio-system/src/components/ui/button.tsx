import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@promptstudio/system/lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-ps-2 whitespace-nowrap rounded-sm text-button-14 font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ps-press [&_svg]:pointer-events-none [&_svg]:size-icon-md [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:brightness-110",
        destructive:
          "bg-destructive text-destructive-foreground hover:brightness-110",
        outline:
          "border border-border bg-transparent text-muted hover:border-border-strong hover:bg-surface-3 hover:text-foreground",
        secondary:
          "border border-border bg-surface-2 text-foreground hover:bg-surface-3",
        ghost:
          "bg-transparent text-muted hover:bg-surface-3 hover:text-foreground",
        canvas:
          "border border-transparent bg-transparent text-muted hover:border-border hover:bg-surface-3 hover:text-foreground",
        "canvas-solid":
          "border border-border bg-surface-2 text-foreground hover:border-border-strong hover:bg-surface-3",
        gradient:
          "border border-border bg-gradient-to-r from-accent to-accent-2 text-app shadow-md transition-transform hover:-translate-y-px disabled:hover:translate-y-0",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-ps-6 px-ps-2 text-button-11",
        sm: "h-ps-6 px-ps-3 text-button-12",
        default: "h-ps-6 px-ps-4",
        md: "h-ps-6 px-ps-4",
        lg: "h-ps-9 px-ps-6 text-button-16",
        xl: "h-ps-10 px-ps-7 text-button-16",
        icon: "h-ps-8 w-ps-8 px-0",
        "icon-xs": "h-ps-8 w-ps-8 px-0 [&_svg]:size-icon-sm",
        "icon-sm": "h-ps-8 w-ps-8 px-0",
        "icon-lg": "h-ps-8 w-ps-8 px-0 [&_svg]:size-icon-lg",
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
            <svg
              className="absolute animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="sr-only">Loading</span>
            <span className="invisible">{children}</span>
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
