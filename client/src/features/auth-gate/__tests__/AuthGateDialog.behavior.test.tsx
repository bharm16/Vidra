import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AuthGateDialog } from "../AuthGateDialog";
import {
  authGateController,
  type AuthGateOutcome,
} from "../authGateController";

const auth = vi.hoisted(() => ({
  signInWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
}));
vi.mock("@hooks/useAuthUser", () => ({ useAuthUser: () => null }));
vi.mock("@repositories/index", () => ({ getAuthRepository: () => auth }));

beforeEach(() => {
  vi.resetAllMocks();
  authGateController.cancelPending();
});
afterEach(() => {
  act(() => authGateController.cancelPending());
});

function openGate(reason: "pre-go" | "http-401"): Promise<AuthGateOutcome> {
  let pending: Promise<AuthGateOutcome> | undefined;
  act(() => {
    pending = authGateController.requestAuth({ reason });
  });
  if (!pending) throw new Error("Auth gate did not open");
  return pending;
}

describe("AuthGateDialog pending action contract", () => {
  it("cancels the pending generation action through the visible close control", async () => {
    render(<AuthGateDialog />);
    const outcome = openGate("pre-go");
    expect(
      screen.getByRole("heading", { name: "Sign in to make it" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close sign-in" }));
    expect(await outcome).toBe("cancelled");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps an expired-session request pending after credentials are rejected", async () => {
    auth.signInWithEmail.mockRejectedValue({ code: "auth/invalid-credential" });
    render(<AuthGateDialog />);
    const outcome = openGate("http-401");
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "creator@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "incorrect" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect email or password.",
    );
    expect(authGateController.isPending()).toBe(true);
    expect(screen.getByLabelText("Email")).toHaveValue("creator@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Close sign-in" }));
    expect(await outcome).toBe("cancelled");
  });

  it("validates empty credentials before contacting Firebase", async () => {
    render(<AuthGateDialog />);
    const outcome = openGate("pre-go");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter your email and password.",
    );
    expect(auth.signInWithEmail).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close sign-in" }));
    expect(await outcome).toBe("cancelled");
  });
});
