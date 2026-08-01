/**
 * Grid Component (PromptStudio System)
 *
 * Grid is used to organize content in columns and rows. It provides convenient
 * access to CSS grid properties, with optional system spacing token support.
 */

import React from "react";
import { Box, type BoxProps } from "./Box";

export interface GridProps extends BoxProps {
  /**
   * Grid columns - accepts CSS grid-template-columns value
   * Examples: "1fr", "repeat(3, 1fr)", "1fr 2fr", etc.
   */
  columns?: string | { [key: string]: string };

  /**
   * Grid rows - accepts CSS grid-template-rows value
   */
  rows?: string | { [key: string]: string };

  /**
   * Gap between grid items
   */
  gap?: string | { [key: string]: string };

  /**
   * Column gap
   */
  columnGap?: string | { [key: string]: string };

  /**
   * Row gap
   */
  rowGap?: string | { [key: string]: string };

  /**
   * Grid area
   */
  area?: string | { [key: string]: string };

  /**
   * Grid column
   */
  column?: string | { [key: string]: string };

  /**
   * Grid row
   */
  row?: string | { [key: string]: string };
}

function getGridClasses(
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

export const Grid = React.forwardRef<HTMLDivElement, GridProps>(
  (
    {
      columns,
      rows,
      gap,
      columnGap,
      rowGap,
      area,
      column,
      row,
      className = "",
      style = {},
      ...boxProps
    },
    ref,
  ): React.ReactElement => {
    const gapToken = typeof gap === "string" ? psTokenToCssVar(gap) : undefined;
    const colGapToken =
      typeof columnGap === "string" ? psTokenToCssVar(columnGap) : undefined;
    const rowGapToken =
      typeof rowGap === "string" ? psTokenToCssVar(rowGap) : undefined;

    const gridClasses = [
      "grid",
      gapToken ? "" : getGridClasses(gap, "gap"),
      colGapToken ? "" : getGridClasses(columnGap, "gap-x"),
      rowGapToken ? "" : getGridClasses(rowGap, "gap-y"),
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const inlineStyles: React.CSSProperties = {
      ...style,
      ...(gapToken ? { gap: gapToken } : {}),
      ...(colGapToken ? { columnGap: colGapToken } : {}),
      ...(rowGapToken ? { rowGap: rowGapToken } : {}),
      ...(columns && typeof columns === "string"
        ? { gridTemplateColumns: columns }
        : {}),
      ...(rows && typeof rows === "string" ? { gridTemplateRows: rows } : {}),
      ...(area && typeof area === "string" ? { gridArea: area } : {}),
      ...(column && typeof column === "string" ? { gridColumn: column } : {}),
      ...(row && typeof row === "string" ? { gridRow: row } : {}),
    };

    return (
      <Box
        ref={ref}
        className={gridClasses}
        display="grid"
        style={inlineStyles}
        {...boxProps}
      />
    );
  },
);

Grid.displayName = "Grid";

export default Grid;
