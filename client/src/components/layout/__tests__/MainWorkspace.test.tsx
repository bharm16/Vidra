import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MainWorkspace } from "../MainWorkspace";

vi.mock("@/features/prompt-optimizer/PromptOptimizerContainer", () => ({
  default: () => <div data-testid="prompt-optimizer" />,
}));

vi.mock(
  "@/features/prompt-optimizer/context/GenerationControlsContext",
  () => ({
    GenerationControlsProvider: ({ children }: { children: ReactNode }) => (
      <div data-testid="generation-controls">{children}</div>
    ),
  }),
);

describe("MainWorkspace", () => {
  it("renders the workspace inside the generation-controls provider", () => {
    render(<MainWorkspace />);

    expect(screen.getByTestId("generation-controls")).toBeInTheDocument();
    expect(screen.getByTestId("prompt-optimizer")).toBeInTheDocument();
  });
});
