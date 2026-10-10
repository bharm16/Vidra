import { describe, expect, it, vi } from "vitest";
import { AuthGateController } from "../authGateController";

describe("AuthGateController", () => {
  it("resolves the request with 'authenticated' and closes", async () => {
    const controller = new AuthGateController();
    const listener = vi.fn();
    controller.subscribe(listener);

    const pending = controller.requestAuth({ reason: "http-401" });
    controller.resolveAuthenticated();

    await expect(pending).resolves.toBe("authenticated");
    expect(controller.isPending()).toBe(false);
    // Last emit closes the gate (null).
    expect(listener).toHaveBeenLastCalledWith(null);
  });

  it("resolves the request with 'cancelled' when dismissed", async () => {
    const controller = new AuthGateController();

    const pending = controller.requestAuth({ reason: "pre-go" });
    controller.cancelPending();

    await expect(pending).resolves.toBe("cancelled");
    expect(controller.isPending()).toBe(false);
  });

  it("coalesces concurrent requests onto one dialog and resolves them together", async () => {
    const controller = new AuthGateController();
    const listener = vi.fn();
    controller.subscribe(listener);

    const first = controller.requestAuth({ reason: "pre-go" });
    const second = controller.requestAuth({ reason: "http-401" });

    // Only one open emission — the second request coalesces.
    const openCalls = listener.mock.calls.filter(([arg]) => arg !== null);
    expect(openCalls).toHaveLength(1);
    // The first (already-open) reason wins.
    expect(openCalls[0]?.[0]).toEqual({ reason: "pre-go" });

    controller.resolveAuthenticated();

    await expect(first).resolves.toBe("authenticated");
    await expect(second).resolves.toBe("authenticated");
  });

  it("re-opens cleanly after a prior request settles", async () => {
    const controller = new AuthGateController();

    const first = controller.requestAuth({ reason: "pre-go" });
    controller.cancelPending();
    await first;

    const second = controller.requestAuth({ reason: "http-401" });
    expect(controller.isPending()).toBe(true);
    controller.resolveAuthenticated();
    await expect(second).resolves.toBe("authenticated");
  });

  it("stops notifying after unsubscribe", () => {
    const controller = new AuthGateController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    unsubscribe();
    void controller.requestAuth({ reason: "pre-go" });

    expect(listener).not.toHaveBeenCalled();
  });
});
