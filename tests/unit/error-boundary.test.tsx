import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { logger } from "@/services/LoggingService";

vi.mock("@/services/LoggingService", () => ({
  logger: {
    error: vi.fn(),
  },
}));

let shouldThrow = true;
const Thrower = (): ReactElement => {
  if (shouldThrow) {
    throw new Error("boom");
  }
  return <div>Recovered</div>;
};
const fallback = ({ resetError }: { resetError: () => void }): ReactElement => (
  <button onClick={resetError}>Try again</button>
);

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    shouldThrow = true;
  });

  it("renders the fallback and logs the error", () => {
    render(
      <ErrorBoundary fallback={fallback}>
        <Thrower />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(vi.mocked(logger).error).toHaveBeenCalledWith(
      "Error caught by boundary",
      expect.any(Error),
      expect.objectContaining({ component: "ErrorBoundary" }),
    );
  });

  it("renders the children again after Try again", () => {
    render(
      <ErrorBoundary fallback={fallback}>
        <Thrower />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Recovered")).toBeInTheDocument();
  });

  it("clears the fallback when the reset key changes, such as leaving the page", () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/studio" fallback={fallback}>
        <Thrower />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    rerender(
      <ErrorBoundary resetKey="/contact" fallback={fallback}>
        <Thrower />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Recovered")).toBeInTheDocument();
  });
});
