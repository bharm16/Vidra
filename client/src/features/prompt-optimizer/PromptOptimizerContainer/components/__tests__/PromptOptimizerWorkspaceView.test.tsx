import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { PromptOptimizerWorkspaceView } from "../PromptOptimizerWorkspaceView";

vi.mock("@components/navigation/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("../../../layouts/PromptResultsLayout", () => ({
  PromptResultsLayout: () => <div data-testid="prompt-results-layout" />,
}));

vi.mock("../../../components/PromptModals", () => ({
  PromptModals: () => null,
}));

const buildProps = () => ({ shouldShowLoading: false });

describe("PromptOptimizerWorkspaceView", () => {
  it("always renders prompt results layout when not loading", () => {
    render(<PromptOptimizerWorkspaceView {...buildProps()} />);

    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(
      screen.getByTestId("prompt-results-layout"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading prompt...")).not.toBeInTheDocument();
  });

  it("renders loading state while prompt is loading", () => {
    const props = buildProps();
    render(<PromptOptimizerWorkspaceView {...props} shouldShowLoading />);

    expect(screen.getByText("Loading prompt...")).toBeInTheDocument();
    expect(
      screen.queryByTestId("prompt-results-layout"),
    ).not.toBeInTheDocument();
  });

});
