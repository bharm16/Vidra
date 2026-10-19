import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CapabilityProfileSchema } from "@shared/schemas/workflow/capability.schemas";
import type { DraftContent } from "@shared/schemas/workflow/draft.schemas";
import { CapabilitySettings } from "../components/CapabilitySettings";
import { settingsForProfile } from "../state/profileSettings";
import { modelContent, veo, wan22 } from "./fixtures/modelCreationFixtures";

afterEach(cleanup);

const other = CapabilityProfileSchema.parse({ ...veo, id: "controlled-other", label: "Other", constraints: [], parameters: {
  aspectRatio: { policy: "editable", defaultValue: "16:9", domain: { kind: "enum", values: ["16:9", "9:16", "1:1"] } },
  durationSeconds: { policy: "editable", defaultValue: 5, domain: { kind: "enum", values: [5, 10] } },
} });
const image = CapabilityProfileSchema.parse({ ...veo, id: "controlled-image", label: "Picture", action: "make-image", output: { kind: "image", maxCount: 1 }, generatedAudio: "unsupported", constraints: [], parameters: {
  aspectRatio: { policy: "editable", defaultValue: "1:1", domain: { kind: "enum", values: ["1:1", "16:9"] } },
} });
const content = (profileId: string, parameters: DraftContent["settings"]["parameters"], action: DraftContent["action"] = "make-video"): DraftContent => {
  const base = modelContent(veo);
  return { ...base, action, settings: { ...base.settings, profileId, parameters } };
};

it("lists options other models offer, greyed, and never picks one", () => {
  const change = vi.fn();
  render(<CapabilitySettings profiles={[veo, other]} content={content(veo.id, { aspectRatio: "16:9", duration: 4, resolution: "720p" })} media={[]} disabled={false} onProfile={vi.fn()} onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "Duration: 4s" }));
  const durations = within(screen.getByRole("group", { name: "Duration" })).getAllByRole("button");
  expect(durations.map(option => [option.textContent, (option as HTMLButtonElement).disabled])).toEqual([["4s", false], ["5s", true], ["6s", false], ["8s", false], ["10s", true]]);
  fireEvent.click(screen.getByRole("button", { name: "10s" }));
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Shape: 16:9" }));
  expect(screen.getByRole("button", { name: "1:1" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "9:16" })).toBeEnabled();
});

it("keeps a greyed chip for a video setting the model cannot use, and none on pictures", () => {
  const view = render(<CapabilitySettings profiles={[wan22]} content={content(wan22.id, { aspectRatio: "16:9", resolution: "480p" })} media={[]} disabled={false} onProfile={vi.fn()} onChange={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Sound" })).toBeDisabled();
  expect(screen.queryByText(/not available|does not|can't/i)).not.toBeInTheDocument();
  view.rerender(<CapabilitySettings profiles={[image]} content={content(image.id, { aspectRatio: "1:1" }, "make-image")} media={[]} disabled={false} onProfile={vi.fn()} onChange={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /^(Sound|Duration|Resolution)$/ })).not.toBeInTheDocument();
});

it("moves values the chosen model cannot use to its nearest offer", () => {
  const switched = settingsForProfile(veo, content(other.id, { aspectRatio: "1:1", durationSeconds: 10, retired: "value" }));
  expect(switched.parameters).toEqual({ aspectRatio: "16:9", duration: 8, resolution: "720p" });
  expect(settingsForProfile(veo, content(veo.id, { aspectRatio: "9:16", duration: 4, resolution: "4K" })).parameters).toEqual({ aspectRatio: "9:16", duration: 8, resolution: "4K" });
  expect(settingsForProfile(wan22, content(veo.id, { resolution: "1080p" })).parameters).toMatchObject({ resolution: "720p", numFrames: 81, framesPerSecond: 16 });
});
