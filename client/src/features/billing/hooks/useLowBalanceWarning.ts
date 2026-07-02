import React from "react";
import { useToast } from "@components/Toast";
import { FEATURES } from "@/config/features.config";

interface UseLowBalanceWarningInput {
  userId: string | null;
  balance: number | null;
  requiredCredits: number;
  operation: string;
  enabled?: boolean;
}

const buildWarningKey = (userId: string): string =>
  `low-balance-warned:${userId}`;

export function useLowBalanceWarning({
  userId,
  balance,
  requiredCredits,
  operation,
  enabled = true,
}: UseLowBalanceWarningInput): void {
  const toast = useToast();

  React.useEffect(() => {
    if (!FEATURES.BILLING_UI || !enabled || !userId) return;
    if (balance === null || balance === undefined) return;
    if (!Number.isFinite(requiredCredits) || requiredCredits <= 0) return;
    if (balance >= requiredCredits) return;

    const storageKey = buildWarningKey(userId);
    try {
      if (sessionStorage.getItem(storageKey) === "1") {
        return;
      }
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // Storage can be unavailable in strict browser privacy contexts.
    }
    toast.warning(
      `${operation} needs ${requiredCredits} credits. You currently have ${balance}.`,
    );
  }, [balance, enabled, operation, requiredCredits, toast, userId]);
}
