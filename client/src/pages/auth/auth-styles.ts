/**
 * Shared style constants for all auth pages.
 *
 * @deprecated Being retired under ADR-0008 (one design language across all
 * shells) — do not add consumers. The auth/account pages now style from
 * `@promptstudio/system` semantic tokens; the remaining importers
 * (marketing/billing/legal pages) are being migrated in parallel, after
 * which this file is deleted.
 *
 * These map directly to the tool-sidebar CSS variables so auth pages
 * match the workspace aesthetic exactly.
 */

/** Colors pulled from the tool-sidebar CSS variables */
export const AUTH_COLORS = {
  /** Page background — matches tool rail/panel bg */
  bg: "#131416",
  /** Card surface — matches tool-surface-card */
  card: "#16181E",
  /** Card border — matches tool-nav-active-bg */
  cardBorder: "#22252C",
  /** Input background — matches tool-surface-inset */
  inputBg: "#0F1118",
  /** Input border — matches tool-border-primary */
  inputBorder: "#2C3037",
  /** Input border on focus */
  inputBorderFocus: "#434651",
  /** Focus ring */
  focusRing: "rgba(104, 134, 255, 0.5)",
  /** Divider — matches tool-rail-border */
  divider: "#1B1E23",
  /** Primary text */
  text: "#FFFFFF",
  /** Secondary text — matches tool-text-secondary */
  textSecondary: "#A1AFC5",
  /** Dim text — matches tool-text-dim */
  textDim: "#8B92A5",
  /** Placeholder text — matches tool-text-placeholder */
  textPlaceholder: "#7C839C",
  /** Faint label text — matches tool-text-label */
  textLabel: "#555B6E",
  /** Soft neutral accent — matches tool-accent-soft */
  accent: "#C8C8D0",
  /** Success — matches --ps-success */
  success: "#4ec7a2",
  /** Danger — matches --ps-danger */
  danger: "#fa6e7c",
  /** Hover surface */
  hoverBg: "#1C1E26",
  /** Active surface */
  activeBg: "#22252C",
} as const;

/** Input className shared across all auth forms */
export const AUTH_INPUT_CLASS =
  "mt-1 w-full rounded-lg px-3.5 py-2.5 text-[14px] text-white outline-none transition";

/** Input inline style (colors that need exact hex values) */
export const AUTH_INPUT_STYLE: React.CSSProperties = {
  background: AUTH_COLORS.inputBg,
  border: `1px solid ${AUTH_COLORS.inputBorder}`,
  color: AUTH_COLORS.text,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
};

/** Input inline style on focus — apply via onFocus handler or CSS */
export const AUTH_INPUT_FOCUS_STYLE: React.CSSProperties = {
  border: `1px solid ${AUTH_COLORS.inputBorderFocus}`,
  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.02), 0 0 0 2px ${AUTH_COLORS.focusRing}`,
};

/** Primary CTA button className */
export const AUTH_CTA_CLASS =
  "h-9 w-full gap-2 rounded-lg px-3.5 text-[13px] font-semibold transition";

/** Primary CTA inline style */
export const AUTH_CTA_STYLE: React.CSSProperties = {
  background: AUTH_COLORS.accent,
  color: AUTH_COLORS.bg,
};

/** Secondary/outline button className */
export const AUTH_SECONDARY_BTN_CLASS =
  "h-9 w-full gap-2 rounded-lg px-3.5 text-[13px] font-medium text-white transition";

/** Secondary button inline style */
export const AUTH_SECONDARY_BTN_STYLE: React.CSSProperties = {
  background: AUTH_COLORS.card,
  border: `1px solid ${AUTH_COLORS.cardBorder}`,
};

/** Label className */
export const AUTH_LABEL_CLASS = "text-[11px] font-semibold tracking-[0.2em]";

/** Info card style — matches workspace panel card */
export const AUTH_CARD_STYLE: React.CSSProperties = {
  background: AUTH_COLORS.card,
  border: `1px solid ${AUTH_COLORS.cardBorder}`,
  borderRadius: "10px",
};

/** Error alert style */
export const AUTH_ERROR_STYLE: React.CSSProperties = {
  background: `${AUTH_COLORS.danger}15`,
  border: `1px solid ${AUTH_COLORS.danger}30`,
  borderRadius: "8px",
};

/** Success alert style */
export const AUTH_SUCCESS_STYLE: React.CSSProperties = {
  background: `${AUTH_COLORS.success}15`,
  border: `1px solid ${AUTH_COLORS.success}30`,
  borderRadius: "8px",
};

/** Divider style */
export const AUTH_DIVIDER_STYLE: React.CSSProperties = {
  height: "1px",
  background: AUTH_COLORS.divider,
};
