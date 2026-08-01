/**
 * Layout Components (PromptStudio System)
 *
 * Layout components are used to separate layout responsibilities from content
 * and interactivity. This is the separation of concerns that makes your app
 * maintainable and easy to reason about.
 *
 * System spacing tokens:
 * - ps-0..ps-11 (mapped onto the --space-* scale)
 *
 * Components:
 * - Box: Most fundamental layout component with system spacing support
 * - Flex: Organizes items along an axis using flexbox
 * - Grid: Organizes content in columns and rows
 * - Container: Provides consistent max-width
 * - Section: Provides consistent vertical spacing
 * - MainWorkspace: Conditional renderer for Create/Studio tools
 */

export { Box, type BoxProps } from "./Box";
export { Flex, type FlexProps } from "./Flex";
export { Grid, type GridProps } from "./Grid";
export { Container, type ContainerProps } from "./Container";
export { Section, type SectionProps } from "./Section";
export { MainWorkspace } from "./MainWorkspace";
