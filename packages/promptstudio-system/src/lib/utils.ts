import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The preset's custom font-size keys (tailwind.preset.js → theme.extend.fontSize).
 *
 * tailwind-merge resolves conflicts by utility group, and its default config
 * only knows Tailwind's stock sizes. Without this list it reads `text-meta` as
 * a text *color* and silently drops the other half of a
 * `text-meta text-[color:var(--x)]` pair — no error, just a missing
 * declaration. Keep in sync with the preset.
 */
const FONT_SIZE_KEYS = [
  "display-xl",
  "display-lg",
  "display-md",
  "display-sm",
  "heading",
  "subhead",
  "body-lg",
  "body",
  "ui",
  "ui-mono",
  "meta",
  "h4",
  "h5",
  "heading-20",
  "heading-18",
  "body-xl",
  "body-sm",
  "copy-13",
  "button-16",
  "button-14",
  "button-12",
  "button-11",
  "label-16",
  "label",
  "label-sm",
  "label-12",
  "label-11",
  "label-10",
  "overline",
] as const;

/**
 * Custom border widths (tailwind.preset.js → theme.extend.borderWidth).
 *
 * Same hazard as the font sizes: tailwind-merge only knows Tailwind's numeric
 * widths, so it reads `border-hairline` as a border *color* and drops it when
 * a real color class follows. The symptom is a panel that has the right
 * border color and no border at all.
 */
const BORDER_WIDTH_KEYS = ["hairline"] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...FONT_SIZE_KEYS] }],
      "border-w": [{ border: [...BORDER_WIDTH_KEYS] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
