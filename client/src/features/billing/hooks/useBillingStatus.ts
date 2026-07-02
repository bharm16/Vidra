import React from "react";
import {
  fetchBillingStatus,
  type BillingStatus,
} from "@/features/billing/api/billingApi";
import { useAuthUser } from "@/hooks/useAuthUser";
import { FEATURES } from "@/config/features.config";

interface UseBillingStatusResult {
  status: BillingStatus | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useBillingStatus(): UseBillingStatusResult {
  const user = useAuthUser();
  // ADR-0002: billing is frozen — with the flag off this hook never fetches,
  // so every consumer goes quiet without per-call-site gating.
  const userId = FEATURES.BILLING_UI ? (user?.uid ?? null) : null;
  const [status, setStatus] = React.useState<BillingStatus | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(Boolean(userId));
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    if (!userId) {
      setStatus(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextStatus = await fetchBillingStatus();
      setStatus(nextStatus);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load billing status",
      );
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setStatus(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    void (async () => {
      try {
        const nextStatus = await fetchBillingStatus();
        if (cancelled) return;
        setStatus(nextStatus);
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load billing status",
        );
      } finally {
        if (cancelled) return;
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return {
    status,
    isLoading,
    error,
    refresh: load,
  };
}
