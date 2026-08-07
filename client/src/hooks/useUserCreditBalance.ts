import React from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirebaseDb } from "@/config/firebase";
import { fetchCreditBalance } from "@/features/billing/api/billingApi";

const CREDIT_BALANCE_SYNC_EVENT = "vidra:credit-balance-sync";
const CREDIT_BALANCE_REFRESH_EVENT = "vidra:credit-balance-refresh";
const CREDIT_BALANCE_CACHE_KEY = "vidra:credit-balance-cache";
const OPTIMISTIC_BALANCE_TTL_MS = 30_000;

type CreditBalanceState = {
  balance: number | null;
  isLoading: boolean;
  error: string | null;
};

type CreditBalanceSyncDetail = {
  balance: number;
};

type PersistedCreditBalance = {
  userId: string;
  balance: number;
  syncedAt: number;
};

function normalizeBalance(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw))
    return Math.max(0, Math.trunc(raw));
  return 0;
}

export function publishCreditBalanceSync(balance: number): void {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<CreditBalanceSyncDetail>(CREDIT_BALANCE_SYNC_EVENT, {
      detail: { balance: normalizeBalance(balance) },
    }),
  );
}

export function requestCreditBalanceRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CREDIT_BALANCE_REFRESH_EVENT));
}

function readPersistedCreditBalance(
  userId: string,
): PersistedCreditBalance | null {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  const raw = window.sessionStorage.getItem(CREDIT_BALANCE_CACHE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedCreditBalance>;
    if (
      parsed.userId !== userId ||
      typeof parsed.balance !== "number" ||
      !Number.isFinite(parsed.balance) ||
      typeof parsed.syncedAt !== "number" ||
      !Number.isFinite(parsed.syncedAt)
    ) {
      return null;
    }
    return {
      userId,
      balance: normalizeBalance(parsed.balance),
      syncedAt: parsed.syncedAt,
    };
  } catch {
    return null;
  }
}

function persistCreditBalance(
  userId: string,
  balance: number,
  syncedAt: number,
): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  const payload: PersistedCreditBalance = {
    userId,
    balance: normalizeBalance(balance),
    syncedAt,
  };
  window.sessionStorage.setItem(
    CREDIT_BALANCE_CACHE_KEY,
    JSON.stringify(payload),
  );
}

function clearPersistedCreditBalance(userId: string): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  const persisted = readPersistedCreditBalance(userId);
  if (!persisted) return;
  window.sessionStorage.removeItem(CREDIT_BALANCE_CACHE_KEY);
}

export function useUserCreditBalance(
  userId: string | null,
): CreditBalanceState {
  const [state, setState] = React.useState<CreditBalanceState>({
    balance: null,
    isLoading: Boolean(userId),
    error: null,
  });
  const optimisticBalanceRef = React.useRef<{
    balance: number;
    syncedAt: number;
  } | null>(null);

  React.useEffect(() => {
    if (!userId) {
      optimisticBalanceRef.current = null;
      setState({ balance: null, isLoading: false, error: null });
      return;
    }

    let isActive = true;

    const win =
      typeof window !== "undefined"
        ? (window as unknown as Record<string, unknown>)
        : undefined;
    if (win?.__E2E_CREDIT_BALANCE__ !== undefined) {
      setState({
        balance: win.__E2E_CREDIT_BALANCE__ as number,
        isLoading: false,
        error: null,
      });
      return;
    }

    const persistedBalance = readPersistedCreditBalance(userId);
    if (
      persistedBalance &&
      Date.now() - persistedBalance.syncedAt < OPTIMISTIC_BALANCE_TTL_MS
    ) {
      optimisticBalanceRef.current = persistedBalance;
      setState({
        balance: persistedBalance.balance,
        isLoading: true,
        error: null,
      });
    }

    const refreshBalanceFromApi = async (): Promise<void> => {
      try {
        const nextBalance = normalizeBalance(await fetchCreditBalance());
        if (!isActive) return;
        const optimistic = optimisticBalanceRef.current;
        const shouldHoldOptimisticBalance =
          optimistic !== null &&
          Date.now() - optimistic.syncedAt < OPTIMISTIC_BALANCE_TTL_MS &&
          nextBalance > optimistic.balance;

        if (shouldHoldOptimisticBalance) {
          setState((prev) => {
            if (
              prev.balance === optimistic.balance &&
              !prev.isLoading &&
              prev.error === null
            ) {
              return prev;
            }
            return {
              balance: optimistic.balance,
              isLoading: false,
              error: null,
            };
          });
          return;
        }

        optimisticBalanceRef.current = null;
        clearPersistedCreditBalance(userId);
        setState((prev) => {
          if (
            prev.balance === nextBalance &&
            !prev.isLoading &&
            prev.error === null
          ) {
            return prev;
          }
          return { balance: nextBalance, isLoading: false, error: null };
        });
      } catch (error) {
        if (!isActive) return;
        setState((prev) => ({
          balance: prev.balance,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to load credit balance",
        }));
      }
    };

    const handleCreditBalanceSync = (event: Event): void => {
      const detail = (event as CustomEvent<CreditBalanceSyncDetail>).detail;
      const nextBalance = normalizeBalance(detail?.balance);
      const syncedAt = Date.now();
      optimisticBalanceRef.current = {
        balance: nextBalance,
        syncedAt,
      };
      persistCreditBalance(userId, nextBalance, syncedAt);
      setState((prev) => {
        if (
          prev.balance === nextBalance &&
          !prev.isLoading &&
          prev.error === null
        ) {
          return prev;
        }
        return { balance: nextBalance, isLoading: false, error: null };
      });
    };

    const handleCreditBalanceRefresh = (): void => {
      void refreshBalanceFromApi();
    };

    window.addEventListener(CREDIT_BALANCE_SYNC_EVENT, handleCreditBalanceSync);
    window.addEventListener(
      CREDIT_BALANCE_REFRESH_EVENT,
      handleCreditBalanceRefresh,
    );
    setState((prev) => ({
      balance: prev.balance,
      isLoading: true,
      error: null,
    }));

    const userRef = doc(getFirebaseDb(), "users", userId);
    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        const data = snapshot.data() as Record<string, unknown> | undefined;
        if (data?.credits === undefined || data?.credits === null) {
          void refreshBalanceFromApi();
          return;
        }
        const nextBalance = normalizeBalance(data?.credits);
        const optimistic = optimisticBalanceRef.current;
        const shouldHoldOptimisticBalance =
          optimistic !== null &&
          Date.now() - optimistic.syncedAt < OPTIMISTIC_BALANCE_TTL_MS &&
          nextBalance > optimistic.balance;

        if (shouldHoldOptimisticBalance) {
          setState((prev) => {
            if (
              prev.balance === optimistic.balance &&
              !prev.isLoading &&
              prev.error === null
            ) {
              return prev;
            }
            return {
              balance: optimistic.balance,
              isLoading: false,
              error: null,
            };
          });
          return;
        }

        if (optimistic !== null && nextBalance <= optimistic.balance) {
          optimisticBalanceRef.current = null;
          clearPersistedCreditBalance(userId);
        }

        setState((prev) => {
          if (
            prev.balance === nextBalance &&
            !prev.isLoading &&
            prev.error === null
          ) {
            return prev;
          }
          return { balance: nextBalance, isLoading: false, error: null };
        });
      },
      (error) => {
        void refreshBalanceFromApi();
        setState((prev) => ({
          balance: prev.balance,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to load credit balance",
        }));
      },
    );

    return () => {
      isActive = false;
      window.removeEventListener(
        CREDIT_BALANCE_SYNC_EVENT,
        handleCreditBalanceSync,
      );
      window.removeEventListener(
        CREDIT_BALANCE_REFRESH_EVENT,
        handleCreditBalanceRefresh,
      );
      unsubscribe();
    };
  }, [userId]);

  return state;
}
