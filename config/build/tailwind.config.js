import path from "path";
import { fileURLToPath } from "url";
import promptStudioPreset from "@promptstudio/system/tailwind.preset";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.resolve(__dirname, "../../client/index.html"),
    path.resolve(__dirname, "../../client/src/**/*.{js,ts,jsx,tsx}"),
    // Include design-system components (Tailwind classes live there)
    path.resolve(
      __dirname,
      "../../packages/promptstudio-system/src/**/*.{js,ts,jsx,tsx}",
    ),
  ],
  presets: [promptStudioPreset],
  theme: {
    extend: {
      // ============================================
      // TOOL SIDEBAR COLORS
      // Maps CSS variables from client/src/index.css
      // ============================================
      colors: {
        tool: {
          "panel-inner": "var(--tool-panel-inner-bg)",
          "rail-border": "var(--tool-rail-border)",
          "nav-active": "var(--tool-nav-active-bg)",
          "border-primary": "var(--tool-border-primary)",
          "border-dark": "var(--tool-border-dark)",
          "text-secondary": "var(--tool-text-secondary)",
          "text-muted": "var(--tool-text-muted)",
          "text-placeholder": "var(--tool-text-placeholder)",
          "accent-soft": "var(--tool-accent-soft)",
          "nav-hover": "var(--tool-nav-hover-bg)",
          "text-subdued": "var(--tool-text-subdued)",
          "surface-inset": "var(--tool-surface-inset)",
          "surface-deep": "var(--tool-surface-deep)",
          "text-dim": "var(--tool-text-dim)",
          "text-label": "var(--tool-text-label)",
          "text-disabled": "var(--tool-text-disabled)",
          "surface-card": "var(--tool-surface-card)",
          "surface-prompt": "var(--tool-surface-prompt)",
          "surface-prompt-compact": "var(--tool-surface-prompt-compact)",
          "accent-neutral": "var(--tool-accent-neutral)",
        },
        "accent-runway": "var(--foreground)" /* bridge → foreground */,
      },

      // ============================================
      // ANIMATION & TRANSITIONS
      // Consistent timing and easing
      // ============================================
      transitionDuration: {
        75: "75ms",
        150: "150ms",
        200: "200ms",
        300: "300ms",
      },
      animation: {
        "fade-in": "fadeIn 200ms cubic-bezier(0.4, 0, 0.2, 1)",
        "scale-in": "scaleIn 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        shimmer: "shimmer 2s infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", filter: "blur(4px)" },
          "100%": { opacity: "1", filter: "blur(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
      },

      // ============================================
      // BREAKPOINTS (using default Tailwind)
      // sm: 640px, md: 768px, lg: 1024px, xl: 1280px, 2xl: 1536px
      // ============================================

      // ============================================
      // CONTAINER
      // Max width container with consistent padding
      // ============================================
      container: {
        center: true,
        padding: {
          DEFAULT: "1rem",
          sm: "1.5rem",
          lg: "2rem",
          xl: "2.5rem",
          "2xl": "3rem",
        },
        screens: {
          sm: "640px",
          md: "768px",
          lg: "1024px",
          xl: "1280px",
          "2xl": "1400px",
        },
      },
    },
  },
  plugins: [],
};
