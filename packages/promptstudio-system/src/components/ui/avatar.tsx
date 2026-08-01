import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@promptstudio/system/lib/utils";

const avatarVariants = cva(
  "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2",
  {
    variants: {
      size: {
        xs: "h-6 w-6 text-meta",
        sm: "h-8 w-8 text-label-sm",
        default: "h-10 w-10 text-body-sm",
        lg: "h-12 w-12 text-body",
        xl: "h-16 w-16 text-h5",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export interface AvatarProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof avatarVariants> {
  src?: string | null;
  alt?: string;
  fallback?: string;
}

const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, size, src, alt = "", fallback, ...props }, ref) => {
    const [imgError, setImgError] = React.useState(false);
    const showImage = src && !imgError;

    return (
      <span
        ref={ref}
        className={cn(avatarVariants({ size }), className)}
        {...props}
      >
        {showImage ? (
          <img
            src={src}
            alt={alt}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <span
            className="text-foreground font-semibold"
            aria-hidden={Boolean(alt)}
          >
            {fallback || alt?.charAt(0).toUpperCase() || "?"}
          </span>
        )}
      </span>
    );
  },
);
Avatar.displayName = "Avatar";

export { Avatar, avatarVariants };
