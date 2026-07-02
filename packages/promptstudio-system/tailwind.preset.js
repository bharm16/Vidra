import plugin from "tailwindcss/plugin";
import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--ps-font-sans)"],
        mono: ["var(--ps-font-mono)"],
      },
      colors: {
        app: "var(--ps-bg)",
        sidebar: "var(--ps-sidebar-bg)",
        background: "var(--background)",
        "surface-1": "var(--ps-surface-1)",
        "surface-2": "var(--ps-surface-2)",
        "surface-3": "var(--ps-surface-3)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        border: "var(--ps-border)",
        "border-strong": "var(--ps-border-strong)",
        input: "var(--input)",
        ring: "var(--ring)",
        foreground: "var(--ps-text)",
        "foreground-warm": "var(--ps-text-warm)",
        muted: "var(--ps-text-muted)",
        "muted-foreground": "var(--muted-foreground)",
        faint: "var(--ps-text-faint)",
        accent: {
          DEFAULT: "var(--ps-accent)",
          foreground: "var(--accent-foreground)",
          50: "var(--ps-brand-accent-50)",
          100: "var(--ps-brand-accent-100)",
          200: "var(--ps-brand-accent-200)",
          300: "var(--ps-brand-accent-300)",
          400: "var(--ps-brand-accent-400)",
          500: "var(--ps-brand-accent-500)",
          600: "var(--ps-brand-accent-600)",
          700: "var(--ps-brand-accent-700)",
          800: "var(--ps-brand-accent-800)",
          900: "var(--ps-brand-accent-900)",
          950: "var(--ps-brand-accent-950)",
        },
        "accent-2": "var(--ps-accent-2)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
          50: "var(--ps-brand-primary-50)",
          100: "var(--ps-brand-primary-100)",
          200: "var(--ps-brand-primary-200)",
          300: "var(--ps-brand-primary-300)",
          400: "var(--ps-brand-primary-400)",
          500: "var(--ps-brand-primary-500)",
          600: "var(--ps-brand-primary-600)",
          700: "var(--ps-brand-primary-700)",
          800: "var(--ps-brand-primary-800)",
          900: "var(--ps-brand-primary-900)",
          950: "var(--ps-brand-primary-950)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
          50: "var(--ps-brand-secondary-50)",
          100: "var(--ps-brand-secondary-100)",
          200: "var(--ps-brand-secondary-200)",
          300: "var(--ps-brand-secondary-300)",
          400: "var(--ps-brand-secondary-400)",
          500: "var(--ps-brand-secondary-500)",
          600: "var(--ps-brand-secondary-600)",
          700: "var(--ps-brand-secondary-700)",
          800: "var(--ps-brand-secondary-800)",
          900: "var(--ps-brand-secondary-900)",
          950: "var(--ps-brand-secondary-950)",
        },
        neutral: {
          50: "var(--ps-brand-neutral-50)",
          100: "var(--ps-brand-neutral-100)",
          200: "var(--ps-brand-neutral-200)",
          300: "var(--ps-brand-neutral-300)",
          400: "var(--ps-brand-neutral-400)",
          500: "var(--ps-brand-neutral-500)",
          600: "var(--ps-brand-neutral-600)",
          700: "var(--ps-brand-neutral-700)",
          800: "var(--ps-brand-neutral-800)",
          900: "var(--ps-brand-neutral-900)",
          950: "var(--ps-brand-neutral-950)",
        },
        success: {
          DEFAULT: "var(--ps-brand-success-500)",
          50: "var(--ps-brand-success-50)",
          100: "var(--ps-brand-success-100)",
          200: "var(--ps-brand-success-200)",
          300: "var(--ps-brand-success-300)",
          400: "var(--ps-brand-success-400)",
          500: "var(--ps-brand-success-500)",
          600: "var(--ps-brand-success-600)",
          700: "var(--ps-brand-success-700)",
          800: "var(--ps-brand-success-800)",
          900: "var(--ps-brand-success-900)",
          950: "var(--ps-brand-success-950)",
        },
        warning: {
          DEFAULT: "var(--ps-brand-warning-500)",
          50: "var(--ps-brand-warning-50)",
          100: "var(--ps-brand-warning-100)",
          200: "var(--ps-brand-warning-200)",
          300: "var(--ps-brand-warning-300)",
          400: "var(--ps-brand-warning-400)",
          500: "var(--ps-brand-warning-500)",
          600: "var(--ps-brand-warning-600)",
          700: "var(--ps-brand-warning-700)",
          800: "var(--ps-brand-warning-800)",
          900: "var(--ps-brand-warning-900)",
          950: "var(--ps-brand-warning-950)",
        },
        error: {
          DEFAULT: "var(--ps-brand-error-500)",
          50: "var(--ps-brand-error-50)",
          100: "var(--ps-brand-error-100)",
          200: "var(--ps-brand-error-200)",
          300: "var(--ps-brand-error-300)",
          400: "var(--ps-brand-error-400)",
          500: "var(--ps-brand-error-500)",
          600: "var(--ps-brand-error-600)",
          700: "var(--ps-brand-error-700)",
          800: "var(--ps-brand-error-800)",
          900: "var(--ps-brand-error-900)",
          950: "var(--ps-brand-error-950)",
        },
        info: {
          DEFAULT: "var(--ps-brand-info-500)",
          50: "var(--ps-brand-info-50)",
          100: "var(--ps-brand-info-100)",
          200: "var(--ps-brand-info-200)",
          300: "var(--ps-brand-info-300)",
          400: "var(--ps-brand-info-400)",
          500: "var(--ps-brand-info-500)",
          600: "var(--ps-brand-info-600)",
          700: "var(--ps-brand-info-700)",
          800: "var(--ps-brand-info-800)",
          900: "var(--ps-brand-info-900)",
          950: "var(--ps-brand-info-950)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        danger: "var(--ps-danger)",
        ghost: "var(--ps-text-ghost)",
        "brand-primary": {
          50: "var(--ps-brand-primary-50)",
          100: "var(--ps-brand-primary-100)",
          200: "var(--ps-brand-primary-200)",
          300: "var(--ps-brand-primary-300)",
          400: "var(--ps-brand-primary-400)",
          500: "var(--ps-brand-primary-500)",
          600: "var(--ps-brand-primary-600)",
          700: "var(--ps-brand-primary-700)",
          800: "var(--ps-brand-primary-800)",
          900: "var(--ps-brand-primary-900)",
          950: "var(--ps-brand-primary-950)",
        },
        "brand-accent": {
          50: "var(--ps-brand-accent-50)",
          100: "var(--ps-brand-accent-100)",
          200: "var(--ps-brand-accent-200)",
          300: "var(--ps-brand-accent-300)",
          400: "var(--ps-brand-accent-400)",
          500: "var(--ps-brand-accent-500)",
          600: "var(--ps-brand-accent-600)",
          700: "var(--ps-brand-accent-700)",
          800: "var(--ps-brand-accent-800)",
          900: "var(--ps-brand-accent-900)",
          950: "var(--ps-brand-accent-950)",
        },
        "surface-base": "var(--ps-brand-surface-base)",
        "surface-subtle": "var(--ps-brand-surface-subtle)",
        "surface-elevated": "var(--ps-brand-surface-elevated)",
        "surface-overlay": "var(--ps-brand-surface-overlay)",
        "text-ink": "var(--ps-brand-text-ink)",
        "text-charcoal": "var(--ps-brand-text-charcoal)",
        "text-muted": "var(--ps-brand-text-muted)",
        "text-subtle": "var(--ps-brand-text-subtle)",
        "border-default": "var(--ps-brand-border-default)",
        "border-accent": "var(--ps-brand-border-accent)",
        "ui-background": "var(--ps-brand-ui-background)",
        "ui-surface": "var(--ps-brand-ui-surface)",
        "text-primary": "var(--ps-brand-text-primary)",
        "text-secondary": "var(--ps-brand-text-secondary)",
        "borders-lines": "var(--ps-brand-borders-lines)",
      },
      // Dense UI guideline: prefer spacing scale 2, 3, 4, 6, 8, 12, 16.
      spacing: {
        "ps-0": "var(--ps-space-0)",
        "ps-1": "var(--ps-space-1)",
        "ps-2": "var(--ps-space-2)",
        "ps-3": "var(--ps-space-3)",
        "ps-4": "var(--ps-space-4)",
        "ps-5": "var(--ps-space-5)",
        "ps-6": "var(--ps-space-6)",
        "ps-7": "var(--ps-space-7)",
        "ps-8": "var(--ps-space-8)",
        "ps-9": "var(--ps-space-9)",
        "ps-10": "var(--ps-space-10)",
        "ps-11": "var(--ps-space-11)",
        "ps-page": "var(--ps-space-page)",
        "ps-card": "var(--ps-space-card)",
        "icon-xs": "var(--ps-icon-xs)",
        "icon-sm": "var(--ps-icon-sm)",
        "icon-md": "var(--ps-icon-md)",
        "icon-lg": "var(--ps-icon-lg)",
        "icon-xl": "var(--ps-icon-xl)",
        "icon-2xl": "var(--ps-icon-2xl)",
      },
      height: {
        // Component sizing overrides (keeps spacing scale intact)
        "ps-6": "36px",
        "ps-7": "32px",
        "ps-8": "32px",
      },
      width: {
        // Component sizing overrides (keeps spacing scale intact)
        "ps-7": "32px",
        "ps-8": "32px",
        sidebar: "var(--ps-sidebar-width)",
      },
      minWidth: {
        sidebar: "var(--ps-sidebar-width)",
      },
      maxWidth: {
        sidebar: "var(--ps-sidebar-width)",
      },
      flexBasis: {
        sidebar: "var(--ps-sidebar-width)",
      },
      borderRadius: {
        none: "var(--ps-r-none)",
        xs: "var(--ps-r-xs)",
        sm: "var(--ps-r-sm)",
        md: "var(--ps-r-md)",
        lg: "var(--ps-r-lg)",
        xl: "var(--ps-r-xl)",
        "2xl": "var(--ps-r-2xl)",
        full: "var(--ps-r-pill)",
      },
      borderWidth: {
        DEFAULT: "var(--ps-bw-1)",
        0: "var(--ps-bw-0)",
        2: "var(--ps-bw-2)",
        3: "var(--ps-bw-3)",
        4: "var(--ps-bw-4)",
      },
      boxShadow: {
        sm: "var(--ps-shadow-sm)",
        md: "var(--ps-shadow-md)",
        lg: "var(--ps-shadow-lg)",
        elevated: "var(--ps-shadow-elevated)",
        floating: "var(--ps-shadow-floating)",
        inset: "var(--ps-shadow-inset)",
      },
      transitionDuration: {
        fast: "var(--ps-motion-fast)",
        base: "var(--ps-motion-base)",
        slow: "var(--ps-motion-slow)",
      },
      // Ordered stacking scale (see tokens.css):
      // base < sticky < fixed < dropdown < popover < drawer < modal < tooltip < toast
      zIndex: {
        base: "var(--ps-z-base)",
        sticky: "var(--ps-z-sticky)",
        fixed: "var(--ps-z-fixed)",
        dropdown: "var(--ps-z-dropdown)",
        popover: "var(--ps-z-popover)",
        drawer: "var(--ps-z-drawer)",
        "modal-backdrop": "var(--ps-z-modal-backdrop)",
        modal: "var(--ps-z-modal)",
        tooltip: "var(--ps-z-tooltip)",
        toast: "var(--ps-z-toast)",
      },
      opacity: {
        0: "var(--ps-opacity-0)",
        5: "var(--ps-opacity-5)",
        10: "var(--ps-opacity-10)",
        15: "var(--ps-opacity-15)",
        20: "var(--ps-opacity-20)",
        25: "var(--ps-opacity-25)",
        30: "var(--ps-opacity-30)",
        40: "var(--ps-opacity-40)",
        50: "var(--ps-opacity-50)",
        60: "var(--ps-opacity-60)",
        70: "var(--ps-opacity-70)",
        75: "var(--ps-opacity-75)",
        80: "var(--ps-opacity-80)",
        90: "var(--ps-opacity-90)",
        95: "var(--ps-opacity-95)",
        100: "var(--ps-opacity-100)",
      },
      fontSize: {
        h1: [
          "var(--ps-fs-32)",
          {
            lineHeight: "var(--ps-lh-snug)",
            letterSpacing: "var(--ps-ls-tight)",
            fontWeight: "var(--ps-fw-semibold)",
          },
        ],
        h2: [
          "var(--ps-fs-24)",
          {
            lineHeight: "var(--ps-lh-snug)",
            letterSpacing: "var(--ps-ls-tight)",
            fontWeight: "var(--ps-fw-semibold)",
          },
        ],
        h3: [
          "var(--ps-fs-20)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "var(--ps-ls-tight)",
            fontWeight: "var(--ps-fw-semibold)",
          },
        ],
        h4: [
          "var(--ps-fs-18)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "var(--ps-ls-tight)",
            fontWeight: "var(--ps-fw-semibold)",
          },
        ],
        h5: [
          "var(--ps-fs-16)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "var(--ps-ls-tight)",
            fontWeight: "var(--ps-fw-semibold)",
          },
        ],
        body: [
          "var(--ps-fs-14)",
          {
            lineHeight: "var(--ps-lh-relaxed)",
            letterSpacing: "var(--ps-ls-normal)",
            fontWeight: "var(--ps-fw-regular)",
          },
        ],
        "body-lg": [
          "var(--ps-fs-16)",
          {
            lineHeight: "var(--ps-lh-relaxed)",
            letterSpacing: "var(--ps-ls-normal)",
            fontWeight: "var(--ps-fw-regular)",
          },
        ],
        "body-xl": [
          "var(--ps-fs-16)",
          {
            lineHeight: "24px",
            letterSpacing: "var(--ps-ls-reading)",
            fontWeight: "var(--ps-fw-regular)",
          },
        ],
        "body-sm": [
          "var(--ps-fs-13)",
          {
            lineHeight: "var(--ps-lh-relaxed)",
            letterSpacing: "var(--ps-ls-normal)",
            fontWeight: "var(--ps-fw-regular)",
          },
        ],
        label: [
          "var(--ps-fs-12)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "var(--ps-ls-label)",
            fontWeight: "var(--ps-fw-semibold)",
          },
        ],
        "label-sm": [
          "var(--ps-fs-12)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "var(--ps-ls-label)",
            fontWeight: "var(--ps-fw-semibold)",
          },
        ],
        "label-caps": [
          "var(--ps-fs-12)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "var(--ps-ls-caps)",
            fontWeight: "var(--ps-fw-semibold)",
            textTransform: "uppercase",
          },
        ],
        /* Overline — the uppercase micro-label (Tune drawer section labels,
           history OUTPUT labels). The only sanctioned uppercase treatment;
           everything else is sentence case (ADR-0008). */
        overline: [
          "var(--ps-fs-10)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "var(--ps-ls-overline)",
            fontWeight: "var(--ps-fw-semibold)",
            textTransform: "uppercase",
          },
        ],
        meta: [
          "var(--ps-fs-12)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "var(--ps-ls-normal)",
            fontWeight: "var(--ps-fw-regular)",
          },
        ],
        code: [
          "var(--ps-fs-13)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "var(--ps-ls-normal)",
            fontWeight: "var(--ps-fw-regular)",
          },
        ],

        /* Compatibility sizes used across the app (kept in the system preset) */
        "heading-40": [
          "var(--ps-fs-40)",
          {
            lineHeight: "var(--ps-lh-snug)",
            letterSpacing: "-0.01em",
            fontWeight: "700",
          },
        ],
        "heading-32": [
          "var(--ps-fs-32)",
          {
            lineHeight: "var(--ps-lh-snug)",
            letterSpacing: "var(--ps-ls-tight)",
            fontWeight: "600",
          },
        ],
        "heading-24": [
          "var(--ps-fs-24)",
          {
            lineHeight: "var(--ps-lh-snug)",
            letterSpacing: "var(--ps-ls-tight)",
            fontWeight: "600",
          },
        ],
        "heading-20": [
          "var(--ps-fs-20)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "var(--ps-ls-tight)",
            fontWeight: "600",
          },
        ],
        "heading-18": [
          "var(--ps-fs-18)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "var(--ps-ls-tight)",
            fontWeight: "600",
          },
        ],
        "heading-16": [
          "var(--ps-fs-16)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "var(--ps-ls-tight)",
            fontWeight: "600",
          },
        ],
        "heading-14": [
          "var(--ps-fs-14)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "var(--ps-ls-tight)",
            fontWeight: "600",
          },
        ],

        "button-16": [
          "var(--ps-fs-16)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "var(--ps-ls-normal)",
            fontWeight: "500",
          },
        ],
        "button-14": [
          "var(--ps-fs-14)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "var(--ps-ls-normal)",
            fontWeight: "500",
          },
        ],
        "button-12": [
          "var(--ps-fs-12)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "0.01em",
            fontWeight: "500",
          },
        ],
        "button-11": [
          "var(--ps-fs-11)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "0.01em",
            fontWeight: "500",
          },
        ],

        "label-16": [
          "var(--ps-fs-16)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "var(--ps-ls-normal)",
            fontWeight: "500",
          },
        ],
        "label-14": [
          "var(--ps-fs-14)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "var(--ps-ls-normal)",
            fontWeight: "500",
          },
        ],
        "label-13": [
          "var(--ps-fs-13)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "var(--ps-ls-normal)",
            fontWeight: "500",
          },
        ],
        "label-12": [
          "var(--ps-fs-12)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "0.01em",
            fontWeight: "500",
          },
        ],
        "label-11": [
          "var(--ps-fs-11)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "0.01em",
            fontWeight: "500",
          },
        ],
        "label-10": [
          "var(--ps-fs-10)",
          {
            lineHeight: "var(--ps-lh-normal)",
            letterSpacing: "0.02em",
            fontWeight: "600",
          },
        ],

        "copy-16": [
          "var(--ps-fs-16)",
          {
            lineHeight: "var(--ps-lh-relaxed)",
            letterSpacing: "var(--ps-ls-normal)",
            fontWeight: "400",
          },
        ],
        "copy-14": [
          "var(--ps-fs-14)",
          {
            lineHeight: "var(--ps-lh-relaxed)",
            letterSpacing: "var(--ps-ls-normal)",
            fontWeight: "400",
          },
        ],
        "copy-13": [
          "var(--ps-fs-13)",
          {
            lineHeight: "var(--ps-lh-relaxed)",
            letterSpacing: "var(--ps-ls-normal)",
            fontWeight: "400",
          },
        ],
      },
    },
  },
  plugins: [
    animate,
    /* Tailwind's fontSize plugin only emits font-size / line-height /
       letter-spacing / font-weight from the size tuple — the textTransform
       entries above are silently dropped. Emit the overline's uppercase here
       so text-overline actually uppercases (matching .ps-overline in
       type.css) instead of depending on source casing. */
    plugin(({ addUtilities }) => {
      addUtilities({
        ".text-overline": { textTransform: "uppercase" },
      });
    }),
  ],
};
