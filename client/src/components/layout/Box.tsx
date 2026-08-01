/**
 * Box Component (PromptStudio System)
 *
 * The most fundamental layout component. Box is used to:
 * - Provide spacing to child elements using system spacing tokens
 * - Impose sizing constraints on content
 * - Control layout behaviour within flex and grid containers
 * - Hide content based on screen size using responsive display prop
 *
 * System spacing tokens: ps-0..ps-11 (mapped onto the --space-* scale)
 */

import React from "react";
import type { HTMLAttributes } from "react";

export interface BoxProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Padding - can use space scale steps or any valid CSS padding value
   * Supports responsive object: { sm: '4', lg: '6' }
   */
  p?: string | { [key: string]: string };
  px?: string | { [key: string]: string };
  py?: string | { [key: string]: string };
  pt?: string | { [key: string]: string };
  pr?: string | { [key: string]: string };
  pb?: string | { [key: string]: string };
  pl?: string | { [key: string]: string };

  /**
   * Margin - can use space scale steps or any valid CSS margin value
   */
  m?: string | { [key: string]: string };
  mx?: string | { [key: string]: string };
  my?: string | { [key: string]: string };
  mt?: string | { [key: string]: string };
  mr?: string | { [key: string]: string };
  mb?: string | { [key: string]: string };
  ml?: string | { [key: string]: string };

  /**
   * Width - accepts any valid CSS width value
   */
  width?: string | { [key: string]: string };
  minWidth?: string | { [key: string]: string };
  maxWidth?: string | { [key: string]: string };

  /**
   * Height - accepts any valid CSS height value
   */
  height?: string | { [key: string]: string };
  minHeight?: string | { [key: string]: string };
  maxHeight?: string | { [key: string]: string };

  /**
   * Positioning
   */
  position?:
    | "static"
    | "relative"
    | "absolute"
    | "fixed"
    | "sticky"
    | { [key: string]: string };
  inset?: string | { [key: string]: string };
  top?: string | { [key: string]: string };
  right?: string | { [key: string]: string };
  bottom?: string | { [key: string]: string };
  left?: string | { [key: string]: string };

  /**
   * Display - responsive display control
   */
  display?:
    | "block"
    | "inline-block"
    | "inline"
    | "flex"
    | "inline-flex"
    | "grid"
    | "none"
    | { [key: string]: string };

  /**
   * Background color
   */
  backgroundColor?: string;

  /**
   * Border radius
   */
  borderRadius?: string;

  /**
   * Box shadow
   */
  boxShadow?: string;
}

/**
 * Converts responsive prop to Tailwind classes
 */
/**
 * System spacing token mapping
 * Converts system tokens to CSS values (CSS vars)
 */
const psSpacingMap: Record<string, string> = {
  "ps-0": "0px",
  "ps-1": "var(--space-1)",
  "ps-2": "var(--space-2)",
  "ps-3": "var(--space-3)",
  "ps-4": "var(--space-3)",
  "ps-5": "var(--space-4)",
  "ps-6": "var(--space-4)",
  "ps-7": "var(--space-5)",
  "ps-8": "var(--space-6)",
  "ps-9": "var(--space-12)",
  "ps-10": "var(--space-8)",
  "ps-11": "var(--space-16)",
  "ps-page": "var(--space-6)",
  "ps-card": "var(--space-4)",
};

function getResponsiveClasses(
  prop: string | { [key: string]: string } | undefined,
  prefix: string,
): string {
  if (!prop) return "";

  if (typeof prop === "string") {
    // Handle system spacing tokens
    if (prop.startsWith("ps-")) {
      const tokenValue = psSpacingMap[prop];
      if (tokenValue) {
        // Return empty string - we'll handle system tokens via inline styles
        return "";
      }
    }
    // Handle Polaris spacing tokens
    if (prop.startsWith("polaris-")) {
      return `${prefix}-${prop}`;
    }
    // Handle regular spacing
    return `${prefix}-${prop}`;
  }

  // Handle responsive object
  const classes: string[] = [];
  Object.entries(prop).forEach(([breakpoint, value]) => {
    if (breakpoint === "initial" || breakpoint === "base") {
      if (typeof value === "string" && value.startsWith("ps-")) {
        // Skip system tokens in classes, handle via inline styles
        return;
      }
      classes.push(`${prefix}-${value}`);
    } else {
      if (typeof value === "string" && value.startsWith("ps-")) {
        return;
      }
      classes.push(`${breakpoint}:${prefix}-${value}`);
    }
  });
  return classes.join(" ");
}

/**
 * Get system spacing value for inline styles
 */
function getSystemSpacingValue(
  prop: string | { [key: string]: string } | undefined,
): string | undefined {
  if (!prop) return undefined;

  if (typeof prop === "string" && prop.startsWith("ps-")) {
    return psSpacingMap[prop];
  }

  return undefined;
}

export const Box = React.forwardRef<HTMLDivElement, BoxProps>(
  (
    {
      p,
      px,
      py,
      pt,
      pr,
      pb,
      pl,
      m,
      mx,
      my,
      mt,
      mr,
      mb,
      ml,
      width,
      minWidth,
      maxWidth,
      height,
      minHeight,
      maxHeight,
      position,
      inset,
      top,
      right,
      bottom,
      left,
      display,
      backgroundColor,
      borderRadius,
      boxShadow,
      className = "",
      style = {},
      children,
      ...props
    },
    ref,
  ): React.ReactElement => {
    // Build Tailwind classes
    const positionClass =
      typeof position === "string"
        ? position === "relative"
          ? "relative"
          : position === "absolute"
            ? "absolute"
            : position === "fixed"
              ? "fixed"
              : position === "sticky"
                ? "sticky"
                : position === "static"
                  ? "static"
                  : ""
        : "";

    const displayClass =
      typeof display === "string"
        ? display === "none"
          ? "hidden"
          : display === "block"
            ? "block"
            : display === "inline-block"
              ? "inline-block"
              : display === "inline"
                ? "inline"
                : display === "flex"
                  ? "flex"
                  : display === "inline-flex"
                    ? "inline-flex"
                    : display === "grid"
                      ? "grid"
                      : ""
        : "";

    const classes = [
      getResponsiveClasses(p, "p"),
      getResponsiveClasses(px, "px"),
      getResponsiveClasses(py, "py"),
      getResponsiveClasses(pt, "pt"),
      getResponsiveClasses(pr, "pr"),
      getResponsiveClasses(pb, "pb"),
      getResponsiveClasses(pl, "pl"),
      getResponsiveClasses(m, "m"),
      getResponsiveClasses(mx, "mx"),
      getResponsiveClasses(my, "my"),
      getResponsiveClasses(mt, "mt"),
      getResponsiveClasses(mr, "mr"),
      getResponsiveClasses(mb, "mb"),
      getResponsiveClasses(ml, "ml"),
      positionClass,
      displayClass,
      className,
    ]
      .filter(Boolean)
      .join(" ");

    // Handle system spacing tokens via inline styles
    const systemPadding = getSystemSpacingValue(p);
    const systemPaddingX = getSystemSpacingValue(px);
    const systemPaddingY = getSystemSpacingValue(py);
    const systemPaddingTop = getSystemSpacingValue(pt);
    const systemPaddingRight = getSystemSpacingValue(pr);
    const systemPaddingBottom = getSystemSpacingValue(pb);
    const systemPaddingLeft = getSystemSpacingValue(pl);
    const systemMargin = getSystemSpacingValue(m);
    const systemMarginX = getSystemSpacingValue(mx);
    const systemMarginY = getSystemSpacingValue(my);
    const systemMarginTop = getSystemSpacingValue(mt);
    const systemMarginRight = getSystemSpacingValue(mr);
    const systemMarginBottom = getSystemSpacingValue(mb);
    const systemMarginLeft = getSystemSpacingValue(ml);

    // Build inline styles for properties not covered by Tailwind
    const inlineStyles: React.CSSProperties = {
      ...style,
      ...(systemPadding ? { padding: systemPadding } : {}),
      ...(systemPaddingX
        ? { paddingLeft: systemPaddingX, paddingRight: systemPaddingX }
        : {}),
      ...(systemPaddingY
        ? { paddingTop: systemPaddingY, paddingBottom: systemPaddingY }
        : {}),
      ...(systemPaddingTop ? { paddingTop: systemPaddingTop } : {}),
      ...(systemPaddingRight ? { paddingRight: systemPaddingRight } : {}),
      ...(systemPaddingBottom ? { paddingBottom: systemPaddingBottom } : {}),
      ...(systemPaddingLeft ? { paddingLeft: systemPaddingLeft } : {}),
      ...(systemMargin ? { margin: systemMargin } : {}),
      ...(systemMarginX
        ? { marginLeft: systemMarginX, marginRight: systemMarginX }
        : {}),
      ...(systemMarginY
        ? { marginTop: systemMarginY, marginBottom: systemMarginY }
        : {}),
      ...(systemMarginTop ? { marginTop: systemMarginTop } : {}),
      ...(systemMarginRight ? { marginRight: systemMarginRight } : {}),
      ...(systemMarginBottom ? { marginBottom: systemMarginBottom } : {}),
      ...(systemMarginLeft ? { marginLeft: systemMarginLeft } : {}),
      ...(width && typeof width === "string" ? { width } : {}),
      ...(minWidth && typeof minWidth === "string" ? { minWidth } : {}),
      ...(maxWidth && typeof maxWidth === "string" ? { maxWidth } : {}),
      ...(height && typeof height === "string" ? { height } : {}),
      ...(minHeight && typeof minHeight === "string" ? { minHeight } : {}),
      ...(maxHeight && typeof maxHeight === "string" ? { maxHeight } : {}),
      ...(inset && typeof inset === "string" ? { inset } : {}),
      ...(top && typeof top === "string" ? { top } : {}),
      ...(right && typeof right === "string" ? { right } : {}),
      ...(bottom && typeof bottom === "string" ? { bottom } : {}),
      ...(left && typeof left === "string" ? { left } : {}),
      ...(backgroundColor ? { backgroundColor } : {}),
      ...(borderRadius ? { borderRadius } : {}),
      ...(boxShadow ? { boxShadow } : {}),
    };

    return (
      <div ref={ref} className={classes} style={inlineStyles} {...props}>
        {children}
      </div>
    );
  },
);

Box.displayName = "Box";

export default Box;
