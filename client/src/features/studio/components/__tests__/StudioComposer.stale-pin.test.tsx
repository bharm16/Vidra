import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StudioModelInfo } from "../../api/schemas";
import { StudioComposer } from "../StudioComposer";

/**
 * Behavior 9: a saved pin that no longer resolves in the roster reads as
 * Auto and the composer shows a one-line notice. A valid pin shows its
 * display name and no notice.
 */

const models: StudioModelInfo[] = [
  {
    slug: "recraft-v4.1",
    displayName: "Recraft V4.1",
    capabilities: ["design", "general"],
    latencyHintSeconds: 6,
  },
];

function renderComposer(pinnedModel: string | null, roster = models) {
  return render(
    <StudioComposer
      models={roster}
      pinnedModel={pinnedModel}
      busy={false}
      onPin={vi.fn()}
      onSend={vi.fn()}
    />,
  );
}

describe("StudioComposer — stale pin (behavior 9)", () => {
  it("shows the notice and falls back to Auto for a stale pin", () => {
    renderComposer("recraft-v3-retired");

    expect(screen.getByRole("status")).toHaveTextContent(
      "Your pinned model is no longer available — using Auto.",
    );
    expect(screen.getByRole("button", { name: /Auto/ })).toBeInTheDocument();
  });

  it("shows no notice for a valid pin", () => {
    renderComposer("recraft-v4.1");

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Recraft V4\.1/ }),
    ).toBeInTheDocument();
  });

  it("shows no notice before the roster has loaded", () => {
    renderComposer("recraft-v4.1", []);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
