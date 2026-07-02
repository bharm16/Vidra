import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/CreditBalanceContext", () => ({
  useCreditBalance: () => ({ balance: 1234, isLoading: false, error: null }),
}));

import { useWorkspaceCredits } from "../useWorkspaceCredits";

describe("useWorkspaceCredits", () => {
  it("exposes credits as a number", () => {
    const { result } = renderHook(() => useWorkspaceCredits());
    expect(result.current.credits).toBe(1234);
  });
});

describe("useWorkspaceCredits when balance is null (loading)", () => {
  it("falls back to 0 credits", async () => {
    vi.resetModules();
    vi.doMock("@/contexts/CreditBalanceContext", () => ({
      useCreditBalance: () => ({ balance: null, isLoading: true, error: null }),
    }));
    const { useWorkspaceCredits: useFresh } = await import(
      "../useWorkspaceCredits"
    );
    const { result } = renderHook(() => useFresh());
    expect(result.current.credits).toBe(0);
  });
});
