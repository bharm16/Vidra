import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FailureNotice } from "../FailureNotice";

describe("FailureNotice", () => {
  it("states what failed and retries on the retry action", () => {
    const onRetry = vi.fn();
    render(<FailureNotice failure="writing" onRetry={onRetry} />);
    expect(screen.getByText(/couldn’t expand/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("reassures nothing was charged for a paid generation failure", () => {
    render(<FailureNotice failure="picture" onRetry={vi.fn()} />);
    expect(screen.getByText(/nothing was charged/i)).toBeInTheDocument();
  });

  it("shows no charge line for the free writing failure", () => {
    render(<FailureNotice failure="writing" onRetry={vi.fn()} />);
    expect(screen.queryByText(/nothing was charged/i)).not.toBeInTheDocument();
  });
});
