import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VIDEO_RENDER_MODELS } from "@components/ToolSidebar/config/modelConfig";
import { ModelRecommendationDropdown } from "../ModelRecommendationDropdown";

vi.mock("@promptstudio/system/components/ui", () => {
  const Icon = (props: React.SVGProps<SVGSVGElement>): React.ReactElement => (
    <svg {...props} />
  );
  return {
    Badge: ({ children }: { children: React.ReactNode }): React.ReactElement =>
      React.createElement("span", null, children),
    CaretDown: Icon,
    WarningCircle: Icon,
    X: Icon,
  };
});

describe("ModelRecommendationDropdown", () => {
  it("uses provided render model options for the non-recommended list", async () => {
    const user = userEvent.setup();

    render(
      <ModelRecommendationDropdown
        renderModelOptions={[
          { id: "sora-2", label: "Sora" },
          { id: "google/veo-3", label: "Veo" },
        ]}
        renderModelId="sora-2"
        onModelChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Video model" }));

    expect(screen.getByRole("option", { name: /Sora/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Veo/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Kling/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Luma/i }),
    ).not.toBeInTheDocument();
  });

  it("renders card view when clicked with recommendation model", async () => {
    const user = userEvent.setup();

    render(
      <ModelRecommendationDropdown
        renderModelOptions={VIDEO_RENDER_MODELS.map((model) => ({
          id: model.id,
          label: model.label,
        }))}
        renderModelId="sora-2"
        onModelChange={vi.fn()}
        recommendedModelId="google/veo-3"
        modelRecommendation={{
          promptId: "prompt_alias",
          prompt: "A dramatic slow-motion action scene",
          recommendations: [
            {
              modelId: "veo-4",
              overallScore: 92,
              factorScores: [],
              strengths: ["cinematic lighting", "atmospherics"],
              weaknesses: [],
              warnings: [],
            },
          ],
          recommended: {
            modelId: "veo-4",
            reasoning: "Strong cinematic composition and lighting control",
          },
          suggestComparison: false,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Video model" }));

    expect(screen.getByText("Render models")).toBeInTheDocument();
    expect(screen.getByText("Draft models")).toBeInTheDocument();
    expect(
      screen.getByText("High-quality models for final production output."),
    ).toBeInTheDocument();
  });

  it("shows no credit costs and no gradient placeholders in the showroom", async () => {
    const user = userEvent.setup();

    render(
      <ModelRecommendationDropdown
        renderModelOptions={VIDEO_RENDER_MODELS.map((model) => ({
          id: model.id,
          label: model.label,
        }))}
        renderModelId="sora-2"
        onModelChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Video model" }));

    // Strength copy leads each card (ADR-0008 showroom reskin).
    expect(
      screen.getAllByText("Cinematic motion and high fidelity").length,
    ).toBeGreaterThan(0);
    // Generation economics never speak in the showroom ("~48 cr" chips).
    expect(screen.queryByText(/~\s*\d/)).not.toBeInTheDocument();
    // Gradient placeholder rectangles are banned.
    expect(document.querySelector('[style*="gradient"]')).toBeNull();
  });

  it("selects a model from the showroom and closes it", async () => {
    const user = userEvent.setup();
    const onModelChange = vi.fn();

    render(
      <ModelRecommendationDropdown
        renderModelOptions={[
          { id: "sora-2", label: "Sora" },
          { id: "google/veo-3", label: "Veo" },
        ]}
        renderModelId="sora-2"
        onModelChange={onModelChange}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Video model" });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("option", { name: /Veo/i }));

    expect(onModelChange).toHaveBeenCalledWith("google/veo-3");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the showroom on escape", async () => {
    const user = userEvent.setup();

    render(
      <ModelRecommendationDropdown
        renderModelOptions={[{ id: "sora-2", label: "Sora" }]}
        renderModelId="sora-2"
        onModelChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Video model" });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
