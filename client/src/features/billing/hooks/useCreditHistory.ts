import React from "react";
import {
  fetchCreditHistory,
  type CreditTransaction,
} from "@/features/billing/api/billingApi";
import { useAuthUser } from "@/hooks/useAuthUser";

interface UseCreditHistoryOptions {
  limit?: number;
}

interface UseCreditHistoryResult {
  history: CreditTransaction[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCreditHistory(
  options: UseCreditHistoryOptions = {},
): UseCreditHistoryResult {
  const user = useAuthUser();
  const userId = user?.uid ?? null;
  const limit = typeof options.limit === "number" ? options.limit : 50;
  const [history, setHistory] = React.useState<CreditTransaction[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(Boolean(userId));
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    if (!userId) {
      setHistory([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const rows = await fetchCreditHistory(limit);
      setHistory(rows);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load credit history",
      );
    } finally {
      setIsLoading(false);
    }
  }, [limit, userId]);

  React.useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setHistory([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    void (async () => {
      try {
        const rows = await fetchCreditHistory(limit);
        if (cancelled) return;
        setHistory(rows);
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load credit history",
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [limit, userId]);

  return {
    history,
    isLoading,
    error,
    refresh: load,
  };
}
