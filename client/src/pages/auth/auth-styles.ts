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

/**
 * Bridged to the design system's semantic tokens. These were a standalone
 * palette of hardcoded hex — four blue-tinted greys (#A1AFC5 / #8B92A5 /
 * #7C839C / #555B6E) and a blue focus ring that competed with the system's
 * white one. Each now resolves to a token, so the ~240 existing call sites
 * keep working while these pages join the one neutral ramp.
 *
 * Because the values are now `var(...)`, they can no longer be concatenated
 * with an 8-digit-hex alpha suffix (`${AUTH_COLORS.accent}40`). Use
 * {@link authAlpha} instead.
 */
export const AUTH_COLORS = {
  /** Page background */
  bg: "var(--background)",
  /** Card surface */
  card: "var(--card)",
  /** Card border */
  cardBorder: "var(--border)",
  /** Input background */
  inputBg: "var(--background)",
  /** Input border */
  inputBorder: "var(--border)",
  /** Input border on focus */
  inputBorderFocus: "var(--border-strong)",
  /** Focus ring — the system's single focus treatment, not a second blue */
  focusRing: "var(--ring)",
  /** Divider */
  divider: "var(--border)",
  /** Primary text */
  text: "var(--foreground)",
  /** Secondary text */
  textSecondary: "var(--muted-foreground)",
  /** Dim text */
  textDim: "var(--faint-foreground)",
  /** Placeholder text */
  textPlaceholder: "var(--ghost-foreground)",
  /** Faint label text */
  textLabel: "var(--ghost-foreground)",
  /** Emphasis / selected state */
  accent: "var(--foreground)",
  /** Success */
  success: "var(--success)",
  /** Danger */
  danger: "var(--destructive)",
  /** Hover surface */
  hoverBg: "var(--secondary)",
  /** Active surface */
  activeBg: "var(--secondary)",
} as const;

/**
 * Alpha-blend one of the colors above.
 *
 * Replaces the old `${AUTH_COLORS.x}40` hex-suffix concatenation, which
 * produced invalid CSS once these became variables — and failed silently,
 * since an unparseable declaration is simply dropped.
 */
export const authAlpha = (color: string, percent: number): string =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`;

/** Input className shared across all auth forms */
export const AUTH_INPUT_CLASS =
  "mt-1 w-full rounded-lg px-3.5 py-2.5 text-ui text-white outline-none transition";

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
  "h-9 w-full gap-2 rounded-lg px-3.5 text-ui font-semibold transition";

/** Primary CTA inline style */
export const AUTH_CTA_STYLE: React.CSSProperties = {
  background: AUTH_COLORS.accent,
  color: AUTH_COLORS.bg,
};

/** Secondary/outline button className */
export const AUTH_SECONDARY_BTN_CLASS =
  "h-9 w-full gap-2 rounded-lg px-3.5 text-ui font-medium text-white transition";

/** Secondary button inline style */
export const AUTH_SECONDARY_BTN_STYLE: React.CSSProperties = {
  background: AUTH_COLORS.card,
  border: `1px solid ${AUTH_COLORS.cardBorder}`,
};

/** Label className */
export const AUTH_LABEL_CLASS = "text-meta font-semibold tracking-[0.2em]";

/** Info card style — matches workspace panel card */
export const AUTH_CARD_STYLE: React.CSSProperties = {
  background: AUTH_COLORS.card,
  border: `1px solid ${AUTH_COLORS.cardBorder}`,
  borderRadius: "10px",
};

/** Error alert style */
export const AUTH_ERROR_STYLE: React.CSSProperties = {
  background: authAlpha(AUTH_COLORS.danger, 8),
  border: `1px solid ${authAlpha(AUTH_COLORS.danger, 19)}`,
  borderRadius: "8px",
};

/** Success alert style */
export const AUTH_SUCCESS_STYLE: React.CSSProperties = {
  background: authAlpha(AUTH_COLORS.success, 8),
  border: `1px solid ${authAlpha(AUTH_COLORS.success, 19)}`,
  borderRadius: "8px",
};

/** Divider style */
export const AUTH_DIVIDER_STYLE: React.CSSProperties = {
  height: "1px",
  background: AUTH_COLORS.divider,
};
