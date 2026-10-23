"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import type { IconProps as PhosphorIconProps } from "@phosphor-icons/react";

export type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

const ICON_SIZE_PX: Record<IconSize, number> = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};

export interface IconProps
  extends Omit<PhosphorIconProps, "size">,
    React.ComponentPropsWithoutRef<"svg"> {
  icon: React.ComponentType<PhosphorIconProps>;
  size?: IconSize;
}

const Icon = React.forwardRef<SVGSVGElement, IconProps>(
  (
    {
      icon: IconComponent,
      size = "md",
      className,
      weight = "regular",
      ...props
    },
    ref,
  ) => {
    return (
      <IconComponent
        ref={ref}
        className={cn("shrink-0", className)}
        weight={weight}
        size={ICON_SIZE_PX[size]}
        {...props}
      />
    );
  },
);
Icon.displayName = "Icon";

export { Icon };
