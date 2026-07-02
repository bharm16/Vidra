import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const warningMock = vi.hoisted(() => vi.fn());

vi.mock("@components/Toast", () => ({
  useToast: () => ({
    warning: warningMock,
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock("@/config/features.config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/config/features.config")>();
  return {
    ...actual,
    FEATURES: { ...actual.FEATURES, BILLING_UI: true },
  };
});

import { useLowBalanceWarning } from "../useLowBalanceWarning";

describe("useLowBalanceWarning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("warns once when required credits exceed balance", () => {
    const { rerender } = renderHook(
      ({ balance }) =>
        useLowBalanceWarning({
          userId: "user-1",
          balance,
          requiredCredits: 80,
          operation: "Sora render",
        }),
      {
        initialProps: { balance: 10 },
      },
    );

    expect(warningMock).toHaveBeenCalledTimes(1);

    rerender({ balance: 8 });
    expect(warningMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("low-balance-warned:user-1")).toBe("1");
  });

  it("does not warn when balance is unknown", () => {
    renderHook(() =>
      useLowBalanceWarning({
        userId: "user-1",
        balance: null,
        requiredCredits: 80,
        operation: "Sora render",
      }),
    );

    expect(warningMock).not.toHaveBeenCalled();
  });

  it("tracks warnings per user id", () => {
    renderHook(() =>
      useLowBalanceWarning({
        userId: "user-1",
        balance: 1,
        requiredCredits: 5,
        operation: "Wan preview",
      }),
    );

    renderHook(() =>
      useLowBalanceWarning({
        userId: "user-2",
        balance: 1,
        requiredCredits: 5,
        operation: "Wan preview",
      }),
    );

    expect(warningMock).toHaveBeenCalledTimes(2);
  });
});
