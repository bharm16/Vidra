import { describe, expect, it, vi } from "vitest";
import { runWhenAuthenticated } from "../runWhenAuthenticated";
import type { AuthGateOutcome } from "../authGateController";

function stubGate(outcome: AuthGateOutcome) {
  return {
    requestAuth: vi.fn().mockResolvedValue(outcome),
  };
}

describe("runWhenAuthenticated (pre-Go gate)", () => {
  it("runs the action immediately when already authenticated", async () => {
    const action = vi.fn();
    const authGate = stubGate("authenticated");

    await runWhenAuthenticated({
      isAuthenticated: true,
      reason: "pre-go",
      authGate,
      action,
    });

    expect(action).toHaveBeenCalledTimes(1);
    // No dialog needed when already signed in.
    expect(authGate.requestAuth).not.toHaveBeenCalled();
  });

  it("opens the gate then runs the action after a successful sign-in", async () => {
    const action = vi.fn();
    const authGate = stubGate("authenticated");

    await runWhenAuthenticated({
      isAuthenticated: false,
      reason: "pre-go",
      authGate,
      action,
    });

    expect(authGate.requestAuth).toHaveBeenCalledWith({ reason: "pre-go" });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("does not run the action when the user cancels the dialog", async () => {
    const action = vi.fn();
    const authGate = stubGate("cancelled");

    await runWhenAuthenticated({
      isAuthenticated: false,
      reason: "pre-go",
      authGate,
      action,
    });

    expect(authGate.requestAuth).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
  });
});
