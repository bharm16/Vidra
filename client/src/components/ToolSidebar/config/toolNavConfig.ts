import {
  List,
  SlidersHorizontal,
  Users,
  Palette,
} from "@promptstudio/system/components/ui";
import type { ToolNavItem } from "../types";

export const toolNavItems: ToolNavItem[] = [
  {
    id: "sessions",
    icon: List,
    label: "Sessions",
    variant: "header",
  },
  {
    id: "studio",
    icon: SlidersHorizontal,
    label: "Tool",
    variant: "default",
  },
  {
    id: "characters",
    icon: Users,
    label: "Characters",
    variant: "default",
  },
  {
    id: "styles",
    icon: Palette,
    label: "Styles",
    variant: "default",
  },
];
