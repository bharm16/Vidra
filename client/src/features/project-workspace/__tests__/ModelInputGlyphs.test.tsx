import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ModelInputActions } from "../components/ModelCreationArea";
import { modelSourceCases } from "./fixtures/modelCreationFixtures";

afterEach(cleanup);

it.each([
  ["G02", true],
  ["G08", true],
  ["G09", false],
  ["G31", false],
  ["G32", false],
] as const)("keeps the native end-action presentation and exact input role for %s", (key, optional) => {
  const state = modelSourceCases.find(candidate => candidate.key === key);
  if (!state) throw new Error(`Missing source fixture ${key}`);
  const before = JSON.stringify(state.content);
  const choose = vi.fn();
  render(<ModelInputActions profile={state.profile} inputs={state.content.inputs} disabled={false} onChooseInput={choose} />);
  const start = screen.getByRole("button", { name: "Start frame" });
  const end = screen.getByRole("button", { name: "End frame" });
  expect(start.querySelector("img")).toHaveAttribute("src", "/design-assets/fidelity-model-input-normal.svg");
  expect(end.querySelector("img")).toHaveAttribute("src", optional ? "/design-assets/fidelity-model-input.svg" : "/design-assets/fidelity-model-input-normal.svg");
  if (optional) expect(end).toHaveAttribute("data-optional", "true");
  else expect(end).not.toHaveAttribute("data-optional");
  fireEvent.click(end);
  expect(choose).toHaveBeenCalledExactlyOnceWith("end-frame");
  expect(JSON.stringify(state.content)).toBe(before);
  expect(state.profile.inputs.find(rule => rule.role === "end-frame")?.minCount).toBe(0);
});

it("keeps input callbacks disabled without changing retained input identities", () => {
  const state = modelSourceCases.find(candidate => candidate.key === "G09");
  if (!state) throw new Error("Missing source fixture G09");
  const before = JSON.stringify(state.content.inputs);
  const choose = vi.fn();
  render(<ModelInputActions profile={state.profile} inputs={state.content.inputs} disabled onChooseInput={choose} />);
  for (const button of screen.getAllByRole("button")) {
    expect(button).toBeDisabled();
    fireEvent.click(button);
  }
  expect(choose).not.toHaveBeenCalled();
  expect(JSON.stringify(state.content.inputs)).toBe(before);
});
