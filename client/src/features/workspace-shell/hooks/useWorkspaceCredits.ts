import { useCreditBalance } from "@/contexts/CreditBalanceContext";

export interface UseWorkspaceCreditsResult {
  credits: number;
}

/**
 * Surfaces the credit balance for the workspace top bar.
 *
 * Thin adapter over `useCreditBalance` (sourced from `CreditBalanceProvider`).
 * The provider is mounted high in the tree, so the underlying balance is
 * shared with every other consumer (no extra Firestore subscription).
 *
 * Loading state collapses to `0`; the top bar treats credits as a display-only
 * number and does not need to distinguish "loading" from "actually zero".
 * (The avatar URL this hook once carried left with the top bar's dead avatar
 * circle — the rail's AccountPopover is the one account affordance.)
 */
export function useWorkspaceCredits(): UseWorkspaceCreditsResult {
  const { balance } = useCreditBalance();
  const credits = typeof balance === "number" ? balance : 0;
  return { credits };
}
