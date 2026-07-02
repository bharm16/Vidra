import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@promptstudio/system/lib/utils";

/**
 * Status variants tint from the --ps-badge-* tokens (same family Badge
 * uses). Alpha-modifier classes like border-danger/30 or bg-danger/5 are
 * deliberately avoided: the preset's colors are plain var(--ps-*) strings
 * without <alpha-value>, so Tailwind silently emits nothing for them.
 */
const alertVariants = cva(
  "relative w-full rounded-lg border px-ps-4 py-ps-3 text-body-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-ps-4 [&>svg]:top-ps-4 [&>svg]:text-foreground [&>svg~*]:pl-ps-7",
  {
    variants: {
      variant: {
        default: "border-border bg-surface-1 text-foreground",
        info: "border-[color:var(--ps-badge-info-border)] bg-[color:var(--ps-badge-info-bg)] text-foreground [&>svg]:text-[color:var(--ps-badge-info-text)]",
        success:
          "border-[color:var(--ps-badge-success-border)] bg-[color:var(--ps-badge-success-bg)] text-foreground [&>svg]:text-[color:var(--ps-badge-success-text)]",
        warning:
          "border-[color:var(--ps-badge-warning-border)] bg-[color:var(--ps-badge-warning-bg)] text-foreground [&>svg]:text-[color:var(--ps-badge-warning-text)]",
        error:
          "border-[color:var(--ps-badge-danger-border)] bg-[color:var(--ps-badge-danger-bg)] text-foreground [&>svg]:text-[color:var(--ps-badge-danger-text)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  ),
);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn(
      "mb-ps-1 font-semibold leading-none tracking-tight",
      className,
    )}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-body-sm text-muted [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription, alertVariants };
