import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@promptstudio/system/lib/utils";

const skeletonVariants = cva("animate-pulse rounded-md bg-surface-2", {
  variants: {
    variant: {
      default: "bg-surface-2",
      subtle: "bg-surface-1",
      strong: "bg-raise",
    },
    rounded: {
      default: "rounded-md",
      sm: "rounded-sm",
      lg: "rounded-lg",
      xl: "rounded-xl",
      full: "rounded-full",
    },
  },
  defaultVariants: {
    variant: "default",
    rounded: "default",
  },
});

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant, rounded, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(skeletonVariants({ variant, rounded }), className)}
      aria-hidden="true"
      {...props}
    />
  ),
);
Skeleton.displayName = "Skeleton";

export { Skeleton, skeletonVariants };
