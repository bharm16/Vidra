import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { ButtonHTMLAttributes, TextareaHTMLAttributes } from "react";
import { PromptImprovementForm } from "@/PromptImprovementForm/PromptImprovementForm";

vi.mock("@promptstudio/system/components/ui/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@promptstudio/system/components/ui/textarea", () => ({
  Textarea: ({ ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));

// Questions are derived synchronously from generateFallbackQuestions — the
// real generator runs here. For the prompt "Draft" it classifies as a
// "write"-type prompt with the general example sets.
describe("PromptImprovementForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders context questions synchronously, with no loading state", () => {
    render(
      <PromptImprovementForm onComplete={vi.fn()} initialPrompt="Draft" />,
    );

    expect(
      screen.getByText("What elements should the content include?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Who is the target audience?")).toBeInTheDocument();
    expect(screen.getByText("Where will this be used?")).toBeInTheDocument();
  });

  describe("edge cases", () => {
    it("disables submission when no answers are provided", () => {
      render(
        <PromptImprovementForm onComplete={vi.fn()} initialPrompt="Draft" />,
      );

      const button = screen.getByRole("button", {
        name: "Answer at least one question to continue",
      });
      expect(button).toBeDisabled();
    });

    it("allows skipping context and sends empty answers", () => {
      const onComplete = vi.fn();

      render(
        <PromptImprovementForm onComplete={onComplete} initialPrompt="Draft" />,
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: "Skip and optimize without context",
        }),
      );

      expect(onComplete).toHaveBeenCalledWith("Draft", {
        specificAspects: "",
        backgroundLevel: "",
        intendedUse: "",
      });
    });
  });

  describe("core behavior", () => {
    it("builds an enhanced prompt when answers are provided", () => {
      const onComplete = vi.fn();

      render(
        <PromptImprovementForm onComplete={onComplete} initialPrompt="Draft" />,
      );

      fireEvent.click(
        screen.getByRole("button", { name: "Focus on practical application" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Optimize with Context" }),
      );

      expect(onComplete).toHaveBeenCalledWith(
        expect.stringContaining(
          "Specific Focus: Focus on practical application",
        ),
        {
          specificAspects: "Focus on practical application",
          backgroundLevel: "",
          intendedUse: "",
        },
      );
    });
  });
});
