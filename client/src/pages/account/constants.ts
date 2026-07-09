/**
 * Co-located data + pure helpers for the Account page rebuild
 * (design_handoff_vidra/Account.dc.html · ADR-0014).
 */

/** The three settings sections in the account sub-nav. */
export type AccountSection = "profile" | "subscription" | "usage";

/**
 * PLACEHOLDER presentational data — NOT wired to any live source.
 *
 * The design handoff renders credits / usage / activity dashboards, but Vidra
 * has no such data: ADR-0010 (D12, commit ea1d03d6) removed the credit balance
 * from /account and the generation-economics stack is frozen (ADR-0002,
 * `FEATURES.BILLING_UI` default off). These constants mirror the handoff's mock
 * values so the layout reads correctly on this first visual pass; they must be
 * replaced with real data (or the sections cut) before Account ships. See
 * docs/REBUILD.md open item #3.
 */
export const PLACEHOLDER_USAGE_BARS: readonly number[] = [
  30, 42, 26, 55, 38, 60, 44, 72, 50, 34, 66, 48, 80, 58, 40, 70, 52, 88, 62,
  46, 74, 54, 92, 64, 48, 78, 58, 42, 68, 50,
];
export const PLACEHOLDER_USAGE_PEAK_INDEX = 22;

export const PLACEHOLDER_MINI_BARS: readonly number[] = [
  34, 58, 42, 76, 50, 88, 64,
];
export const PLACEHOLDER_MINI_PEAK_INDEX = 5;

/** Axis ticks under the usage charts. */
export const PLACEHOLDER_AXIS_LABELS = ["Jun 6", "Jun 21", "Jul 5"] as const;

/**
 * Fill for a single usage bar. The peak bar is solid accent; the rest fade to
 * transparent by height. Uses `var(--accent)` via color-mix — never a raw hex.
 */
export function usageBarBackground(height: number, isPeak: boolean): string {
  if (isPeak) return "var(--accent)";
  const pct = 28 + height / 4;
  return `color-mix(in srgb, var(--accent) ${pct}%, transparent)`;
}
