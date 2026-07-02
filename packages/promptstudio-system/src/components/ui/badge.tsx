import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@promptstudio/system/lib/utils";

/**
 * Badge — the one status/label pill.
 *
 * `neutral` is the monochrome default for chrome-level labels; `success`,
 * `warning`, and `danger` tint from the dark-UI status tokens
 * (--ps-badge-* in tokens.css). Pass sentence-case children — uppercase
 * micro-labels belong to the overline type token (`text-overline` /
 * `.ps-overline`), never to badges.
 *
 * Sizes use arbitrary font sizes and colors use `color:`-hinted values on
 * purpose: the default tailwind-merge config inside `cn` cannot tell the
 * preset's custom `text-label-*` font sizes apart from text colors and
 * silently drops one of the pair.
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-full border border-border font-semibold",
  {
    variants: {
      variant: {
        surface: "bg-surface-2 text-foreground",
        subtle: "bg-surface-3 text-muted",
        outline: "bg-transparent text-foreground",
        neutral: "bg-transparent text-muted",
        success:
          "border-[color:var(--ps-badge-success-border)] bg-[color:var(--ps-badge-success-bg)] text-[color:var(--ps-badge-success-text)]",
        warning:
          "border-[color:var(--ps-badge-warning-border)] bg-[color:var(--ps-badge-warning-bg)] text-[color:var(--ps-badge-warning-text)]",
        danger:
          "border-[color:var(--ps-badge-danger-border)] bg-[color:var(--ps-badge-danger-bg)] text-[color:var(--ps-badge-danger-text)]",
      },
      size: {
        xs: "gap-ps-1 px-ps-1 py-0.5 text-[10px]",
        sm: "gap-ps-1 px-ps-2 py-ps-1 text-[11px]",
        default: "gap-ps-2 px-ps-2 py-ps-1 text-[12px]",
        md: "gap-ps-2 px-ps-3 py-ps-1 text-[12px]",
        lg: "gap-ps-2 px-ps-3 py-ps-2 text-[14px]",
      },
    },
    defaultVariants: {
      variant: "surface",
      size: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
