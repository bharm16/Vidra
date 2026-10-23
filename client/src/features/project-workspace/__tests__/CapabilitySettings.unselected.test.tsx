import { useState, type ReactElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CapabilityProfile } from "@shared/schemas/workflow/capability.schemas";
import { DraftContentSchema, type DraftContent } from "@shared/schemas/workflow/draft.schemas";
import { MediaVersionSchema } from "@shared/schemas/workflow/media.schemas";
import { CapabilitySettings } from "../components/CapabilitySettings";
import { preModelParameterChoices, resolveAuto } from "../state/capabilitySettings";
import { presented, veo, runner } from "./fixtures/modelCreationFixtures";

afterEach(cleanup);

const candidate = presented({ ...veo, id: "candidate", inputs: [], parameters: {
  aspectRatio: { policy: "editable", domain: { kind: "enum", values: ["16:9", "9:16"] }, defaultValue: "16:9" },
  durationSeconds: { policy: "editable", domain: { kind: "enum", values: [4, 8, 12] }, defaultValue: 4 },
} });
const initial = DraftContentSchema.parse({ action: "make-video", instructions: "A slow push-in through a rainlit street after dark.", inputs: [], settings: { profileId: "unselected", profileRevision: "unresolved", parameters: { aspectRatio: "16:9", durationSeconds: 5 }, outputCount: 1 }, context: { origin: "empty", requestIds: [], projectInstructionsRevision: 1 }, destination: { projectId: "project_current", conversationId: "conversation_current" } });

function Editable({ profile = candidate, start = initial, onEdit }: { profile?: CapabilityProfile; start?: DraftContent; onEdit(content: DraftContent): void }): ReactElement {
  const [content, setContent] = useState(start);
  return <CapabilitySettings profiles={[profile]} content={content} media={[]} disabled={false} onProfile={vi.fn()} onAuto={vi.fn()} onChange={next => { onEdit(next); setContent(next); }} />;
}

it("edits Auto's shape and duration from what its candidates offer, without selecting a model", () => {
  const edit = vi.fn(); render(<Editable onEdit={edit} />);
  expect(screen.getByRole("button", { name: "Model: Auto" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Shape: 16:9" }));
  fireEvent.click(screen.getByRole("button", { name: "9:16 Portrait" }));
  expect(edit).toHaveBeenLastCalledWith({ ...initial, settings: { ...initial.settings, parameters: { ...initial.settings.parameters, aspectRatio: "9:16" } } });
  fireEvent.click(screen.getByRole("button", { name: "Duration: 5s" }));
  expect(screen.queryByRole("button", { name: "5s" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "8s" }));
  expect(edit).toHaveBeenLastCalledWith({ ...initial, settings: { ...initial.settings, parameters: { aspectRatio: "9:16", durationSeconds: 8 } } });
  expect(initial.settings.parameters.durationSeconds).toBe(5);
});

it("offers only qualified candidates for the place that take the attached inputs", () => {
  const unavailable = presented({ ...candidate, id: "unavailable", availability: "unavailable" });
  const unqualified = presented({ ...candidate, id: "unqualified", availability: "unqualified" });
  const otherPlace = presented({ ...candidate, id: "picture", action: "make-image" });
  const missingInput = presented({ ...candidate, id: "needs-image", inputs: [{ role: "start-frame", kinds: ["image"], minCount: 1, maxCount: 1 }] });
  expect(preModelParameterChoices([unavailable, unqualified, otherPlace], initial, [], "duration")).toEqual({ name: undefined, values: [], ranges: [] });
  // A model still waiting for an input it needs is a candidate; only attached inputs it cannot take rule it out.
  expect(preModelParameterChoices([missingInput], initial, [], "duration").values).toEqual([4, 8, 12]);
  expect(resolveAuto(initial, [missingInput], [])).toBeUndefined();
  expect(preModelParameterChoices([candidate], initial, [], "duration")).toEqual({ name: "durationSeconds", values: [4, 8, 12], ranges: [] });
});

it("greys a core chip no candidate can set, with no reason text", () => {
  for (const policy of [{ policy: "derived", from: "frame-duration" }, { policy: "fixed", value: 5 }, { policy: "unknown", reason: "Not checked" }, { policy: "unsupported", reason: "No duration" }] as const) {
    const profile = presented({ ...candidate, parameters: { ...candidate.parameters, durationSeconds: policy } });
    render(<CapabilitySettings profiles={[profile]} content={initial} media={[]} disabled={false} onProfile={vi.fn()} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Duration" })).toBeDisabled();
    expect(screen.queryByText(/choose a model|not available|cannot/i)).not.toBeInTheDocument();
    cleanup();
  }
});

it("applies each candidate's active constraints without changing the retained value", () => {
  const constrained = presented({ ...candidate, constraints: [{ parameter: "resolution", equals: "1080p", requires: { durationSeconds: [8] }, reason: "1080p needs eight seconds." }] });
  const content: DraftContent = { ...initial, settings: { ...initial.settings, parameters: { ...initial.settings.parameters, resolution: "1080p" } } };
  expect(preModelParameterChoices([constrained], content, [], "duration").values).toEqual([8]);
  expect(content.settings.parameters.durationSeconds).toBe(5);
  expect(preModelParameterChoices([constrained, candidate], content, [], "duration").values).toEqual([4, 8, 12]);
});

it("rejects known incompatible input kinds, counts and metadata while keeping a matching domain", () => {
  const profile = presented({ ...candidate, inputs: [{ role: "clip", kinds: ["video"], minCount: 1, maxCount: 1, maxDurationSeconds: 8 }] });
  const content = DraftContentSchema.parse({ ...initial, inputs: [{ state: "resolved", role: "clip", versionId: "version_clip" }] });
  const clip = MediaVersionSchema.parse({ ...runner, id: "version_clip", projectId: initial.destination.projectId, kind: "video", metadata: { state: "verified", width: 1920, height: 1080, durationSeconds: 8, audio: "absent", probeVersion: "controlled" } });
  expect(preModelParameterChoices([profile], content, [clip], "duration").values).toEqual([4, 8, 12]);
  expect(preModelParameterChoices([profile], content, [], "duration").values).toEqual([]);
  expect(preModelParameterChoices([profile], content, [{ ...clip, kind: "image" }], "duration").values).toEqual([]);
  expect(preModelParameterChoices([profile], content, [MediaVersionSchema.parse({ ...clip, metadata: { state: "pending" } })], "duration").values).toEqual([]);
  expect(preModelParameterChoices([profile], { ...content, inputs: [...content.inputs, ...content.inputs] }, [clip], "duration").values).toEqual([]);
});

it("keeps disjoint ranges separate and commits a slider value only when it is let go", () => {
  const ranged = presented({ ...candidate, parameters: { durationSeconds: { policy: "editable", domain: { kind: "range", min: 2, max: 6, step: 2 }, defaultValue: 6 } } });
  const later = presented({ ...ranged, id: "later-range", parameters: { durationSeconds: { policy: "editable", domain: { kind: "range", min: 10, max: 14, step: 2 }, defaultValue: 10 } } });
  expect(preModelParameterChoices([ranged, later, ranged], initial, [], "duration").ranges).toEqual([{ kind: "range", min: 2, max: 6, step: 2 }, { kind: "range", min: 10, max: 14, step: 2 }]);
  const edit = vi.fn(); render(<Editable profile={ranged} start={{ ...initial, settings: { ...initial.settings, parameters: { durationSeconds: 4 } } }} onEdit={edit} />);
  fireEvent.click(screen.getByRole("button", { name: "Duration: 4s" }));
  const slider = screen.getByRole("slider", { name: "Duration" });
  fireEvent.change(slider, { target: { value: "6" } });
  expect(edit).not.toHaveBeenCalled();
  fireEvent.pointerUp(slider);
  expect(edit).toHaveBeenLastCalledWith({ ...initial, settings: { ...initial.settings, parameters: { durationSeconds: 6 } } });
});

it("resolves Auto to the first candidate that offers every chosen value", () => {
  const short = presented({ ...candidate, id: "short", parameters: { ...candidate.parameters, durationSeconds: { policy: "editable", domain: { kind: "enum", values: [4] }, defaultValue: 4 } } });
  const content = { ...initial, settings: { ...initial.settings, parameters: { aspectRatio: "16:9", durationSeconds: 8 } } };
  expect(resolveAuto(content, [short, candidate], [])?.id).toBe("candidate");
  expect(resolveAuto({ ...content, settings: { ...content.settings, parameters: { durationSeconds: 4 } } }, [short, candidate], [])?.id).toBe("short");
});

it("makes open menu choices inert when the draft becomes read only", () => {
  const change = vi.fn(); const props = { profiles: [candidate], content: initial, media: [], onProfile: vi.fn(), onChange: change };
  const view = render(<CapabilitySettings {...props} disabled={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Duration: 5s" }));
  view.rerender(<CapabilitySettings {...props} disabled />);
  fireEvent.click(screen.getByRole("button", { name: "8s" })); expect(change).not.toHaveBeenCalled();
});

it("keeps a pointer-opened model menu unfocused on search, while keyboard opening still lands in search", async () => {
  const first = render(<Editable onEdit={vi.fn()} />);
  const keyboardTrigger = screen.getByRole("button", { name: "Model: Auto" });
  fireEvent.keyDown(keyboardTrigger, { key: "Enter" }); fireEvent.click(keyboardTrigger);
  const keyboardSearch = await screen.findByRole("searchbox", { name: "Search models" });
  await waitFor(() => expect(keyboardSearch).toHaveFocus());
  first.unmount();
  render(<Editable onEdit={vi.fn()} />);
  const trigger = screen.getByRole("button", { name: "Model: Auto" });
  fireEvent.pointerDown(trigger); fireEvent.click(trigger);
  const search = await screen.findByRole("searchbox", { name: "Search models" });
  expect(search).not.toHaveFocus();
  expect(document.activeElement?.closest(".vf-setting-menu")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "true");
});
