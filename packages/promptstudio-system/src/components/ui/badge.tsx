import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@promptstudio/system/lib/utils";

/**
 * Badge — the one status/label pill.
 *
 * `neutral` is the monochrome default for chrome-level labels; `success`,
 * `warning`, and `danger` tint from the dark-UI status tokens
 * (--badge-* in tokens.css). Pass sentence-case children — uppercase
 * micro-labels belong to the overline type token (`text-overline` /
 * `.ps-overline`), never to badges.
 *
 * Sizes are type-scale tokens and colors are `color:`-hinted values. These
 * coexist because `cn`'s tailwind-merge is extended with the preset's
 * font-size keys (see lib/utils.ts) — without that, the size token reads as a
 * text color and one of the pair is silently dropped.
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
          "border-[color:var(--badge-success-border)] bg-[color:var(--badge-success-bg)] text-[color:var(--badge-success-text)]",
        warning:
          "border-[color:var(--badge-warning-border)] bg-[color:var(--badge-warning-bg)] text-[color:var(--badge-warning-text)]",
        danger:
          "border-[color:var(--badge-danger-border)] bg-[color:var(--badge-danger-bg)] text-[color:var(--badge-danger-text)]",
      },
      size: {
        xs: "gap-ps-1 px-ps-1 py-0.5 text-meta",
        sm: "gap-ps-1 px-ps-2 py-ps-1 text-meta",
        default: "gap-ps-2 px-ps-2 py-ps-1 text-meta",
        md: "gap-ps-2 px-ps-3 py-ps-1 text-meta",
        lg: "gap-ps-2 px-ps-3 py-ps-2 text-ui",
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
