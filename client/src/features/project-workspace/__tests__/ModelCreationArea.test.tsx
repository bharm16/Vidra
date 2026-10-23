import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DraftContent } from "@shared/schemas/workflow/draft.schemas";
import { ModelCreationArea, ModelInputActions } from "../components/ModelCreationArea";
import { CapabilitySettings } from "../components/CapabilitySettings";
import { allowedParameterValues, modelCapabilityDescription, modelCreationFeedback } from "../state/capabilitySettings";
import { modelContent, modelSourceCases, presented, veo, veoExtension, veoFrames, wan22 } from "./fixtures/modelCreationFixtures";

afterEach(cleanup);

it("offers only the selected profile's declared image roles and keeps Sketch independent during lookup", () => {
  const choose = vi.fn(); const sketch = vi.fn();
  const view = render(<ModelInputActions profile={veoFrames} disabled={false} onChooseInput={choose} onSketch={sketch} />);
  expect(screen.queryByRole("button", { name: "References" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "End frame" }));
  expect(choose).toHaveBeenCalledWith("end-frame");
  view.rerender(<ModelInputActions profile={veoFrames} lookupStatus="loading" disabled={false} onChooseInput={choose} onSketch={sketch} />);
  expect(screen.queryByRole("button", { name: "End frame" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Sketch" }));
  expect(sketch).toHaveBeenCalledOnce();
});

it("keeps an end image and exposes the missing required start slot without inventing an input", () => {
  const state = modelSourceCases.find(item => item.key === "G08")!;
  const choose = vi.fn();
  render(<ModelInputActions profile={state.profile} inputs={state.content.inputs} disabled={false} onChooseInput={choose} />);
  fireEvent.click(screen.getByRole("button", { name: "Add start frame" }));
  expect(choose).toHaveBeenCalledWith("start-frame");
  expect(state.content.inputs).toHaveLength(1);
  expect(state.content.inputs[0]?.role).toBe("end-frame");
  expect(modelCreationFeedback(state.profile, state.content, state.media)).toEqual({ tone: "warning", message: "Add a start image" });
});

it("retries failed settings lookup while preserving the actual selected model and draft", () => {
  const retry = vi.fn(); const content = modelContent(veo);
  render(<ModelCreationArea profile={veo} content={content} media={[]} composer={<p>Retained composer</p>} lookupStatus="error" onRetry={retry} />);
  expect(screen.getByRole("heading", { name: "Veo 3.1" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Settings could not load");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
  expect(content.instructions).toContain("Follow the runner");
});

it("moves a coupled duration with its resolution and greys what a retained setup cannot use", () => {
  const initial = modelContent(veo); const change = vi.fn();
  const props = { profiles: [veo], media: [], disabled: false, onProfile: vi.fn(), onChange: change, presentation: "model" as const };
  const view = render(<CapabilitySettings {...props} content={initial} />);
  fireEvent.click(screen.getByRole("button", { name: "Resolution: 720p" }));
  fireEvent.click(screen.getByRole("button", { name: /^1080p 8 seconds required$/ }));
  expect(change).toHaveBeenLastCalledWith({ ...initial, settings: { ...initial.settings, parameters: { ...initial.settings.parameters, resolution: "1080p", duration: 8 } } });
  const incompatible: DraftContent = { ...initial, settings: { ...initial.settings, parameters: { ...initial.settings.parameters, resolution: "1080p" } } };
  expect(allowedParameterValues(veo, incompatible, "duration")).toEqual([8]);
  expect(incompatible.settings.parameters.duration).toBe(4);
  view.rerender(<CapabilitySettings {...props} content={incompatible} />);
  fireEvent.click(screen.getByRole("button", { name: "Duration: 4s" }));
  expect(screen.getByRole("button", { name: "6s" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "8s" }));
  const corrected: DraftContent = { ...incompatible, settings: { ...incompatible.settings, parameters: { ...incompatible.settings.parameters, duration: 8 } } };
  view.rerender(<CapabilitySettings {...props} content={corrected} />);
  expect(screen.getByLabelText("Duration: 8s; fixed by model").tagName).toBe("SPAN");
});

it("keeps frame-derived length readable without serialization or unsupported sound controls", () => {
  render(<CapabilitySettings profiles={[wan22]} content={modelContent(wan22)} media={[]} disabled={false} onProfile={vi.fn()} onChange={vi.fn()} presentation="model" />);
  expect(screen.getByLabelText("Duration: ≈5.1s; from input")).toBeInTheDocument();
  expect(screen.queryByText("Silent")).not.toBeInTheDocument();
  expect(screen.queryByText("mp4")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Advanced length and motion" })).toBeInTheDocument();
});

it("does not advertise an unqualified extension offer as a ready capability", () => {
  const extension = presented({ ...veoExtension, availability: "unqualified", unavailableReason: "No qualified adapter." });
  expect(modelCapabilityDescription(veo, [veo, extension])).not.toContain("extension");
  expect(modelCapabilityDescription(extension, [veo, extension])).toBe("No qualified adapter.");
  expect(modelCreationFeedback(extension, modelContent(extension), [])).toEqual({ tone: "warning", message: "No qualified adapter." });
});

it("derives unsupported-input and extension feedback from real media kind and declared bounds", () => {
  const audio = modelSourceCases.find(item => item.key === "G26")!;
  expect(modelCreationFeedback(audio.profile, audio.content, audio.media)?.message).toBe("Veo 3.1 cannot use audio files");
  const extension = modelSourceCases.find(item => item.key === "G30")!;
  expect(modelCreationFeedback(extension.profile, extension.content, extension.media)).toEqual({ tone: "warning", message: "Veo 3.1 cannot extend this clip", kind: "extension-ineligible" });
});

it("offers the declared image count using the image labels from C03", () => {
  const image = presented({ ...veo, id: "image-count-fixture", action: "make-image", inputs: [], output: { kind: "image", maxCount: 4 }, parameters: {}, constraints: [], generatedAudio: "unsupported" });
  const content = modelContent(image); const change = vi.fn();
  render(<CapabilitySettings profiles={[image]} content={content} media={[]} disabled={false} onProfile={vi.fn()} onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "Images: 1 image" }));
  expect(screen.queryByText("1 result")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "2 images" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "4 images" }));
  expect(change).toHaveBeenLastCalledWith({ ...content, settings: { ...content.settings, outputCount: 4 } });
});

it("places the unavailable-model line before primary controls and keeps the real reason accessible", () => {
  const unavailable = presented({ ...veo, availability: "unqualified", unavailableReason: "No qualified adapter for this mode." });
  const { container } = render(<CapabilitySettings profiles={[unavailable]} content={modelContent(unavailable)} media={[]} disabled={false} onProfile={vi.fn()} onChange={vi.fn()}><button type="button">Make video</button></CapabilitySettings>);
  const notice = screen.getByRole("status");
  expect(notice).toHaveTextContent("Veo 3.1 is unavailable");
  expect(notice).toHaveAttribute("title", "No qualified adapter for this mode.");
  expect(container.querySelector(".vf-settings")?.lastElementChild?.previousElementSibling).toBe(notice);
});
