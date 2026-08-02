import plugin from "tailwindcss/plugin";
import animate from "tailwindcss-animate";

/**
 * The only bridge between src/tokens.css and Tailwind utilities.
 * Entries marked "bridge" keep pre-replacement class names compiling
 * against the new tokens — migrate call sites to the canonical name,
 * then delete the bridge.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
          /* Fixed ink ramp — light marketing/docs surfaces. */
          50: "oklch(98.5% 0.002 90)",
          100: "oklch(97% 0.002 90)",
          200: "oklch(92% 0.002 90)",
          600: "oklch(48% 0.004 250)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          50: "oklch(98.5% 0.002 90)",
          100: "oklch(97% 0.002 90)",
        },
        muted: "var(--muted-foreground)" /* bridge: text-muted = muted text */,
        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--background)",
        },
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        input: "var(--input)",
        ring: "var(--ring)",
        /* The one hover step and the one active step. Controls tint with
           bg-hover / bg-active; nothing invents its own white alpha. */
        /* The canonical surface names. Prefer these at new call sites. */
        canvas: "var(--canvas)",
        chrome: "var(--chrome)",
        raise: "var(--raise)",
        hairline: "var(--hairline)",
        fg: "var(--fg)",
        "fg-muted": "var(--fg-muted)",
        "fg-dim": "var(--fg-dim)",
        "on-primary": "var(--on-primary)",
        fill: "var(--fill)",
        hover: "var(--hover)",
        active: "var(--active)",
        app: "var(--background)" /* bridge → background */,
        "surface-1": "var(--surface-1)",
        "surface-2": "var(--surface-2)",
        faint: "var(--faint-foreground)",
        ghost: "var(--ghost-foreground)",
        "foreground-warm": "var(--foreground)" /* bridge → foreground */,
        success: {
          DEFAULT: "var(--success)",
          400: "oklch(70% 0.13 163)",
          600: "oklch(52% 0.13 160)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          50: "oklch(97% 0.02 85)",
          300: "oklch(80% 0.1 85)",
          400: "oklch(74% 0.12 85)",
          600: "oklch(58% 0.12 80)",
          700: "oklch(50% 0.11 75)",
          900: "oklch(36% 0.08 70)",
        },
        error: {
          DEFAULT: "var(--destructive)" /* bridge → destructive */,
          50: "oklch(96.5% 0.015 20)",
          300: "oklch(76% 0.11 22)",
          400: "oklch(70% 0.15 25)",
          600: "oklch(52% 0.19 27)",
          700: "oklch(45% 0.17 27)",
          900: "oklch(32% 0.12 27)",
        },
        danger: "var(--destructive)" /* bridge → destructive */,
        info: "var(--accent)" /* bridge → accent */,
        neutral: {
          /* Fixed gray ramp — light marketing/docs surfaces. */
          200: "oklch(92% 0 0)",
          600: "oklch(48% 0 0)",
          700: "oklch(40% 0 0)",
          800: "oklch(32% 0 0)",
          900: "oklch(25% 0 0)",
        },
      },
      spacing: {
        /* bridge: dense px ladder → 4px rem scale (10→12, 14→16). */
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
        "ps-card": "var(--space-4)",
        "icon-sm": "var(--icon-sm)",
        "icon-md": "var(--icon-md)",
        "icon-lg": "var(--icon-lg)",
      },
      height: {
        "control-xs": "var(--control-xs)",
        "control-sm": "var(--control-sm)",
        "control-md": "var(--control-md)",
        "control-lg": "var(--control-lg)",
        "control-xl": "var(--control-xl)",
        "ps-6": "var(--control-lg)" /* bridge → control-lg */,
        "ps-7": "var(--control-md)" /* bridge → control-md */,
        "ps-8": "var(--control-md)" /* bridge → control-md */,
      },
      width: {
        /* Square controls need the same value on both axes. Without these,
           w-control-* is not a class at all — Tailwind emits nothing, the
           element gets no width, and a flex child collapses to its content
           (a 36px icon button rendering 19px wide). */
        "control-xs": "var(--control-xs)",
        "control-sm": "var(--control-sm)",
        "control-md": "var(--control-md)",
        "control-lg": "var(--control-lg)",
        "control-xl": "var(--control-xl)",
        "ps-7": "var(--control-md)" /* bridge → control-md */,
        "ps-8": "var(--control-md)" /* bridge → control-md */,
      },
      borderRadius: {
        none: "0px",
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-xl)" /* bridge → xl */,
        full: "var(--radius-full)",
      },
      borderWidth: {
        DEFAULT: "var(--border-thin)",
        hairline: "var(--border-hairline)",
        0: "0px",
        2: "2px",
        4: "4px",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-md)" /* bridge → md; hairlines do the rest */,
        elevated: "var(--shadow-md)" /* bridge → md */,
        popover: "var(--shadow-popover)",
        floating: "var(--shadow-md)" /* bridge → md */,
        inset: "inset 0 1px 0 oklch(100% 0 0 / 0.06)" /* bridge → edge-lit */,
      },
      transitionDuration: {
        instant: "var(--duration-instant)",
        fast: "var(--duration-fast)",
        medium: "var(--duration-medium)",
        slow: "var(--duration-slow)",
        slower: "var(--duration-slower)",
        base: "var(--duration-medium)" /* bridge → medium */,
      },
      transitionTimingFunction: {
        standard: "var(--ease-standard)",
        decelerate: "var(--ease-decelerate)",
        accelerate: "var(--ease-accelerate)",
        emphasized: "var(--ease-emphasized)",
      },
      // Ordered stacking scale (see tokens.css):
      // sticky < overlay < drawer < modal < toast < tooltip
      zIndex: {
        sticky: "var(--z-sticky)",
        overlay: "var(--z-overlay)",
        drawer: "var(--z-drawer)",
        modal: "var(--z-modal)",
        toast: "var(--z-toast)",
        tooltip: "var(--z-tooltip)",
      },
      fontSize: {
        /* Canonical triples — size, line-height, tracking travel together. */
        "display-xl": [
          "var(--text-display-xl)",
          {
            lineHeight: "var(--text-display-xl-lh)",
            letterSpacing: "var(--text-display-xl-ls)",
            fontWeight: "var(--weight-display)",
          },
        ],
        "display-lg": [
          "var(--text-display-lg)",
          {
            lineHeight: "var(--text-display-lg-lh)",
            letterSpacing: "var(--text-display-lg-ls)",
            fontWeight: "var(--weight-display)",
          },
        ],
        "display-md": [
          "var(--text-display-md)",
          {
            lineHeight: "var(--text-display-md-lh)",
            letterSpacing: "var(--text-display-md-ls)",
            fontWeight: "var(--weight-display)",
          },
        ],
        "display-sm": [
          "var(--text-display-sm)",
          {
            lineHeight: "var(--text-display-sm-lh)",
            letterSpacing: "var(--text-display-sm-ls)",
            fontWeight: "var(--weight-display)",
          },
        ],
        heading: [
          "var(--text-heading)",
          {
            lineHeight: "var(--text-heading-lh)",
            letterSpacing: "var(--text-heading-ls)",
            fontWeight: "var(--weight-heading)",
          },
        ],
        subhead: [
          "var(--text-subhead)",
          {
            lineHeight: "var(--text-subhead-lh)",
            letterSpacing: "var(--text-subhead-ls)",
            fontWeight: "var(--weight-heading)",
          },
        ],
        "body-lg": [
          "var(--text-body-lg)",
          {
            lineHeight: "var(--text-body-lg-lh)",
            letterSpacing: "var(--text-body-lg-ls)",
            fontWeight: "var(--weight-body)",
          },
        ],
        body: [
          "var(--text-body)",
          {
            lineHeight: "var(--text-body-lh)",
            letterSpacing: "var(--text-body-ls)",
            fontWeight: "var(--weight-body)",
          },
        ],
        "ui-mono": [
          "var(--text-ui-mono)",
          {
            lineHeight: "var(--text-ui-lh)",
            letterSpacing: "var(--text-ui-ls)",
            fontWeight: "var(--weight-ui)",
          },
        ],
        ui: [
          "var(--text-ui)",
          {
            lineHeight: "var(--text-ui-lh)",
            letterSpacing: "var(--text-ui-ls)",
            fontWeight: "var(--weight-ui)",
          },
        ],
        meta: [
          "var(--text-meta)",
          {
            lineHeight: "var(--text-meta-lh)",
            letterSpacing: "var(--text-meta-ls)",
            fontWeight: "var(--weight-body)",
          },
        ],

        /* Bridges — legacy names on new triples; migrate then delete. */
        h4: [
          "var(--text-subhead)" /* bridge → subhead */,
          {
            lineHeight: "var(--text-subhead-lh)",
            letterSpacing: "var(--text-subhead-ls)",
            fontWeight: "var(--weight-heading)",
          },
        ],
        h5: [
          "var(--text-subhead)" /* bridge → subhead */,
          {
            lineHeight: "var(--text-subhead-lh)",
            letterSpacing: "var(--text-subhead-ls)",
            fontWeight: "var(--weight-heading)",
          },
        ],
        "heading-20": [
          "var(--text-subhead)" /* bridge → subhead */,
          {
            lineHeight: "var(--text-subhead-lh)",
            letterSpacing: "var(--text-subhead-ls)",
            fontWeight: "var(--weight-heading)",
          },
        ],
        "heading-18": [
          "var(--text-subhead)" /* bridge → subhead */,
          {
            lineHeight: "var(--text-subhead-lh)",
            letterSpacing: "var(--text-subhead-ls)",
            fontWeight: "var(--weight-heading)",
          },
        ],
        "body-xl": [
          "var(--text-body)" /* bridge → body */,
          {
            lineHeight: "var(--text-body-lh)",
            letterSpacing: "var(--text-body-ls)",
            fontWeight: "var(--weight-body)",
          },
        ],
        "body-sm": [
          "var(--text-ui)" /* bridge → ui */,
          {
            lineHeight: "var(--text-ui-lh)",
            letterSpacing: "var(--text-ui-ls)",
            fontWeight: "var(--weight-body)",
          },
        ],
        "copy-13": [
          "var(--text-ui)" /* bridge → ui */,
          {
            lineHeight: "var(--text-ui-lh)",
            letterSpacing: "var(--text-ui-ls)",
            fontWeight: "var(--weight-body)",
          },
        ],
        "button-16": [
          "var(--text-body)" /* bridge → body + weight-ui */,
          {
            lineHeight: "var(--text-body-lh)",
            letterSpacing: "var(--text-body-ls)",
            fontWeight: "var(--weight-ui)",
          },
        ],
        "button-14": [
          "var(--text-ui)" /* bridge → ui */,
          {
            lineHeight: "var(--text-ui-lh)",
            letterSpacing: "var(--text-ui-ls)",
            fontWeight: "var(--weight-ui)",
          },
        ],
        "button-12": [
          "var(--text-meta)" /* bridge → meta + weight-ui */,
          {
            lineHeight: "var(--text-meta-lh)",
            letterSpacing: "var(--text-meta-ls)",
            fontWeight: "var(--weight-ui)",
          },
        ],
        "button-11": [
          "var(--text-meta)" /* bridge → meta + weight-ui */,
          {
            lineHeight: "var(--text-meta-lh)",
            letterSpacing: "var(--text-meta-ls)",
            fontWeight: "var(--weight-ui)",
          },
        ],
        "label-16": [
          "var(--text-body)" /* bridge → body + weight-ui */,
          {
            lineHeight: "var(--text-body-lh)",
            letterSpacing: "var(--text-body-ls)",
            fontWeight: "var(--weight-ui)",
          },
        ],
        label: [
          "var(--text-meta)" /* bridge → meta + weight-strong */,
          {
            lineHeight: "var(--text-meta-lh)",
            letterSpacing: "0.02em",
            fontWeight: "var(--weight-strong)",
          },
        ],
        "label-sm": [
          "var(--text-meta)" /* bridge → meta + weight-strong */,
          {
            lineHeight: "var(--text-meta-lh)",
            letterSpacing: "0.02em",
            fontWeight: "var(--weight-strong)",
          },
        ],
        "label-12": [
          "var(--text-meta)" /* bridge → meta + weight-ui */,
          {
            lineHeight: "var(--text-meta-lh)",
            letterSpacing: "0.01em",
            fontWeight: "var(--weight-ui)",
          },
        ],
        "label-11": [
          "var(--text-meta)" /* bridge → meta + weight-ui */,
          {
            lineHeight: "var(--text-meta-lh)",
            letterSpacing: "0.01em",
            fontWeight: "var(--weight-ui)",
          },
        ],
        "label-10": [
          "var(--text-meta)" /* bridge → meta + weight-strong */,
          {
            lineHeight: "var(--text-meta-lh)",
            letterSpacing: "0.02em",
            fontWeight: "var(--weight-strong)",
          },
        ],
        overline: [
          "var(--text-meta)",
          {
            lineHeight: "var(--text-meta-lh)",
            letterSpacing: "0.08em",
            fontWeight: "var(--weight-strong)",
            textTransform: "uppercase",
          },
        ],
      },
    },
  },
  plugins: [
    animate,
    /* Tailwind's fontSize plugin only emits font-size / line-height /
       letter-spacing / font-weight from the size tuple — the textTransform
       entry above is silently dropped. Emit the overline's uppercase here
       so text-overline actually uppercases instead of depending on
       source casing. */
    plugin(({ addUtilities }) => {
      addUtilities({
        ".text-overline": { textTransform: "uppercase" },
      });
    }),
  ],
};
