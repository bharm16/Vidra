/**
 * Flex Component (PromptStudio System)
 *
 * Flex component does everything that Box can do, but comes with an additional
 * set of props to organize items along an axis. It provides convenient access
 * to the CSS flexbox properties.
 */

import React from "react";
import { Box, type BoxProps } from "./Box";

export interface FlexProps extends BoxProps {
  /**
   * Flex direction
   */
  direction?:
    | "row"
    | "column"
    | "row-reverse"
    | "column-reverse"
    | { [key: string]: string };

  /**
   * Align items along the cross axis
   */
  align?:
    | "start"
    | "center"
    | "end"
    | "stretch"
    | "baseline"
    | { [key: string]: string };

  /**
   * Justify content along the main axis
   */
  justify?:
    | "start"
    | "center"
    | "end"
    | "between"
    | "around"
    | "evenly"
    | { [key: string]: string };

  /**
   * Gap between flex items
   */
  gap?: string | { [key: string]: string };

  /**
   * Wrap behavior
   */
  wrap?: "nowrap" | "wrap" | "wrap-reverse" | { [key: string]: string };

  /**
   * Flex grow
   */
  grow?: string | { [key: string]: string };

  /**
   * Flex shrink
   */
  shrink?: string | { [key: string]: string };

  /**
   * Flex basis
   */
  basis?: string | { [key: string]: string };
}

function getFlexClasses(
  prop: string | { [key: string]: string } | undefined,
  prefix: string,
): string {
  if (!prop) return "";

  if (typeof prop === "string") {
    return `${prefix}-${prop}`;
  }

  const classes: string[] = [];
  Object.entries(prop).forEach(([breakpoint, value]) => {
    if (breakpoint === "initial" || breakpoint === "base") {
      classes.push(`${prefix}-${value}`);
    } else {
      classes.push(`${breakpoint}:${prefix}-${value}`);
    }
  });
  return classes.join(" ");
}

const SPACING_TOKEN_MAP = {
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
} as const;

function psTokenToCssVar(token: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(SPACING_TOKEN_MAP, token)) {
    return SPACING_TOKEN_MAP[token as keyof typeof SPACING_TOKEN_MAP];
  }
  return undefined;
}

export const Flex = React.forwardRef<HTMLDivElement, FlexProps>(
  (
    {
      direction = "row",
      align,
      justify,
      gap,
      wrap,
      grow,
      shrink,
      basis,
      className = "",
      style: boxStyle = {},
      ...boxProps
    },
    ref,
  ): React.ReactElement => {
    // Build flex direction classes
    const directionClass =
      typeof direction === "string"
        ? direction === "row"
          ? "flex-row"
          : direction === "column"
            ? "flex-col"
            : direction === "row-reverse"
              ? "flex-row-reverse"
              : direction === "column-reverse"
                ? "flex-col-reverse"
                : ""
        : "";

    // Build align classes
    const alignClass =
      typeof align === "string"
        ? align === "start"
          ? "items-start"
          : align === "center"
            ? "items-center"
            : align === "end"
              ? "items-end"
              : align === "stretch"
                ? "items-stretch"
                : align === "baseline"
                  ? "items-baseline"
                  : ""
        : "";

    // Build justify classes
    const justifyClass =
      typeof justify === "string"
        ? justify === "start"
          ? "justify-start"
          : justify === "center"
            ? "justify-center"
            : justify === "end"
              ? "justify-end"
              : justify === "between"
                ? "justify-between"
                : justify === "around"
                  ? "justify-around"
                  : justify === "evenly"
                    ? "justify-evenly"
                    : ""
        : "";

    // Build wrap classes
    const wrapClass =
      typeof wrap === "string"
        ? wrap === "nowrap"
          ? "flex-nowrap"
          : wrap === "wrap"
            ? "flex-wrap"
            : wrap === "wrap-reverse"
              ? "flex-wrap-reverse"
              : ""
        : "";

    const gapToken = typeof gap === "string" ? psTokenToCssVar(gap) : undefined;
    const flexClasses = [
      "flex",
      directionClass,
      alignClass,
      justifyClass,
      wrapClass,
      gapToken ? "" : getFlexClasses(gap, "gap"),
      typeof grow === "string" ? `grow-${grow}` : "",
      typeof shrink === "string" ? `shrink-${shrink}` : "",
      typeof basis === "string" ? `basis-${basis}` : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const mergedStyle: React.CSSProperties = gapToken
      ? { ...boxStyle, gap: gapToken }
      : boxStyle;

    return (
      <Box
        ref={ref}
        className={flexClasses}
        display="flex"
        style={mergedStyle}
        {...boxProps}
      />
    );
  },
);

Flex.displayName = "Flex";

export default Flex;
