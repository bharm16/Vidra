import { useState, type ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VideoCompositionSchema, VideoTextSchema, type EditCommand, type VideoText } from "@shared/schemas/workflow/video-edit.schemas";
import { CaptionControls } from "../components/EditorPanels";

const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeEach(() => { Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() }); });
afterEach(() => { if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll); else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView"); });

const composition = VideoCompositionSchema.parse({ normalizationVersion: "vidra-cfr30/v1", preset: "landscape", fps: 30, items: [120, 180, 90].map((frames, index) => ({ id: `item_${index + 1}`, versionId: `version_${index + 1}`, kind: "clip", inFrame: 0, outFrame: frames, displayFrames: frames, fit: "fill", sourceAudio: { muted: false, gain: 1 } })), text: [] });
const caption = VideoTextSchema.parse({ id: "caption_offset", text: "Original words", anchor: { kind: "item", itemId: "item_2" }, startFrame: 30, endFrame: 90, x: .08, y: .83, width: .84, height: .12, fontSize: 43.636, fontWeight: 500, fontFamily: "Inter", letterSpacingEm: .01, lineHeightEm: 1.3, color: "#F7F7F7", background: "#242424", align: "center" });

function CaptionHarness({ onCommand }: { onCommand(command: EditCommand): void }): ReactElement {
  const [current, setCurrent] = useState(caption);
  return <CaptionControls composition={{ ...composition, text: [current] }} caption={current} disabled={false} command={command => { onCommand(command); if (command.kind === "text") setCurrent(command.text); }} />;
}

async function attachTo(label: string): Promise<void> {
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Caption attachment" }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: label }));
}

it("keeps the absolute interval and staged caption words when changing Clip 2 to Video time and back", async () => {
  const command = vi.fn(), original = structuredClone(caption);
  render(<CaptionHarness onCommand={command} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Caption text" }), { target: { value: "Still staged words" } });
  await attachTo("Video time");
  expect(command).toHaveBeenLastCalledWith({ kind: "text", text: { ...caption, text: "Still staged words", anchor: { kind: "composition" }, startFrame: 150, endFrame: 210 } });
  await attachTo("Clip 2");
  expect(command).toHaveBeenLastCalledWith({ kind: "text", text: { ...caption, text: "Still staged words" } });
  expect(screen.getByRole("textbox", { name: "Caption text" })).toHaveValue("Still staged words");
  expect(caption).toEqual(original);
});

it("retains the same absolute time when another clip requires negative local offsets instead of silently moving the words", async () => {
  const command = vi.fn(), original = structuredClone(caption);
  render(<CaptionHarness onCommand={command} />);
  await attachTo("Clip 3");
  expect(command).toHaveBeenCalledExactlyOnceWith({ kind: "text", text: { ...caption, anchor: { kind: "item", itemId: "item_3" }, startFrame: -150, endFrame: -90 } });
  const changed: VideoText = command.mock.calls[0]![0].text;
  expect(changed.startFrame + 300).toBe(caption.startFrame + 120);
  expect(changed.endFrame + 300).toBe(caption.endFrame + 120);
  expect(caption).toEqual(original);
});

it("keeps an unavailable original anchor intact and reports the failure without sending a partial edit", async () => {
  const missing = VideoTextSchema.parse({ ...caption, anchor: { kind: "item", itemId: "missing_clip" } }), command = vi.fn();
  render(<CaptionControls composition={composition} caption={missing} disabled={false} command={command} />);
  await attachTo("Video time");
  expect(screen.getByRole("alert")).toHaveTextContent(/unavailable/i);
  expect(command).not.toHaveBeenCalled();
  expect(missing.anchor).toEqual({ kind: "item", itemId: "missing_clip" });
});

it("opens a retained caption buffer without committing it or reporting a new keystroke", () => {
  const command = vi.fn(), draft = vi.fn();
  render(<CaptionControls composition={composition} caption={caption} draftText="Kept local caption words" onDraftText={draft} disabled={false} command={command} />);
  expect(screen.getByRole("textbox", { name: "Caption text" })).toHaveValue("Kept local caption words");
  expect(command).not.toHaveBeenCalled();
  expect(draft).not.toHaveBeenCalled();
  expect(caption.text).toBe("Original words");
});

it("reports caption keystrokes before the existing blur commit and preserves the saved caption fields", () => {
  const command = vi.fn(), draft = vi.fn();
  render(<CaptionControls composition={composition} caption={caption} onDraftText={draft} disabled={false} command={command} />);
  const field = screen.getByRole("textbox", { name: "Caption text" });
  fireEvent.change(field, { target: { value: "A buffered caption change" } });
  expect(field).toHaveValue("A buffered caption change");
  expect(draft).toHaveBeenCalledExactlyOnceWith("A buffered caption change");
  expect(command).not.toHaveBeenCalled();
  fireEvent.blur(field);
  expect(command).toHaveBeenCalledExactlyOnceWith({ kind: "text", text: { ...caption, text: "A buffered caption change" } });
  expect(draft).toHaveBeenCalledTimes(1);
});

it("writes the source portrait Bottom centre intent only after an explicit Position choice", async () => {
  const command = vi.fn(); const saved = structuredClone(caption);
  render(<CaptionControls composition={{ ...composition, preset: "portrait" }} caption={caption} disabled={false} command={command} />);
  expect(command).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Caption position" }));
  fireEvent.click(await screen.findByRole("button", { name: "Bottom centre" }));
  expect(command).toHaveBeenCalledTimes(1);
  const request = command.mock.calls[0]?.[0];
  expect(request).toMatchObject({ kind: "text", text: { placement: "bottom-center", text: caption.text, fontSize: caption.fontSize } });
  expect(request.text.y * 520).toBeCloseTo(452.65, 6);
  expect(request.text.x * 2 + request.text.width).toBeCloseTo(1, 12);
  expect(caption).toEqual(saved); expect(caption).not.toHaveProperty("placement");
});
