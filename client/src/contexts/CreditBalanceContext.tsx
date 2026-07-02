import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useUserCreditBalance } from "@/hooks/useUserCreditBalance";
import { FEATURES } from "@/config/features.config";

interface CreditBalanceContextValue {
  balance: number | null;
  isLoading: boolean;
  error: string | null;
}

const CreditBalanceContext = createContext<CreditBalanceContextValue>({
  balance: null,
  isLoading: false,
  error: null,
});

export function CreditBalanceProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}): React.ReactElement {
  // ADR-0002: billing is frozen — passing null skips the Firestore
  // balance subscription entirely while keeping the provider mounted.
  const state = useUserCreditBalance(FEATURES.BILLING_UI ? userId : null);
  const value = useMemo<CreditBalanceContextValue>(
    () => ({
      balance: state.balance,
      isLoading: state.isLoading,
      error: state.error,
    }),
    [state.balance, state.isLoading, state.error],
  );
  return (
    <CreditBalanceContext.Provider value={value}>
      {children}
    </CreditBalanceContext.Provider>
  );
}

export function useCreditBalance(): CreditBalanceContextValue {
  return useContext(CreditBalanceContext);
}
